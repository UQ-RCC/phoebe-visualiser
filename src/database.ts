import * as http from "http";
import * as pg from "pg";
import * as ws from "ws";
import * as stream from "stream";
import {FrameBuffer} from "./frame-buffer";
import {SetController} from "./renderer"
import * as jss from "json-stringify-safe";
import { ConnectionOptions } from "tls";
import { WSAESTALE } from "constants";
import * as $ from 'jquery';

export interface ChannelRecord
{
	directory: string;
	channel: string;
	segValue: number;
	frames: number
}

const WebSocket = require("ws");

//Gateway to all RESTful database queries
export class DBIO
{
	private static singletonDBIO: DBIO;
	private pool: pg.Pool;
	readonly queryMap: Map<string, string>;
	private userName: string;
	private password: stromg;

	public static login(username: string, password: string): DBIO
	{		
		if (!this.singletonDBIO)
		{
			this.singletonDBIO = new DBIO(username, password);
		}
		return this.singletonDBIO;
	}

	public static getInstance(): DBIO
	{		
		return this.singletonDBIO;
	}

	private constructor(username: string, password: string)
	{
		this.queryMap = new Map<string, string>();

		this.queryMap.set('operation', 'select * from get_operations($1, $2)');
		this.queryMap.set('tree', 'select * from get_directories($1)');		
		this.queryMap.set('get_seg_status', 'select * from get_seg_status($1)');
		this.queryMap.set('enqueue_segmentation_job', 'select * from enqueue_segmentation_job($1, $2)');
		this.queryMap.set('delete_segmentation', 'select * from delete_segmentation($1)');
		this.queryMap.set('activate_frame', 'select * from activate_frame($1, $2)');
		this.queryMap.set('deactivate_frame', 'select * from deactivate_frame($1)');

		//Warning: We are forcing the db's bigint id types to be ints
		pg.types.setTypeParser(20, (v: string) => {return parseInt(v)});
	}

	//TODO clean this mess up...
	public testConnection(): Promise<boolean>
	{		
		return new Promise<boolean>((resolve, reject) =>
		{
			this.userName = $("#fname").val() as string;
			this.password = $("#pword").val() as string;
			this.pool = new pg.Pool({				
				host: 'phoebe.rcc.uq.edu.au',
				port: 1338,				
				database: 'phoebe_prod',
				user: this.userName,
				password: this.password,
				max: 10
			});
			this.pool.connect((e, client, release) =>
			{
				if (e)
				{
					reject(e);
				}
				else
				{
					client.release();
					resolve(true);
				}
			}
		}
	}

	//restReq = {dir/dir/.../dir}/pram1/pramN.../operation
	query(restReq: string): Promise<any[]>
	{
		return new Promise<any[]>((resolve, reject) =>
		{
			const token: string[] = restReq.split("/");
			const key = token.pop();
			const sql = this.queryMap.get(key);
			if (sql)
			{
				const parameterCount = (sql.match(/\$/g) || []).length
				let parameter: string[] = [];
				for (let i: number = parameterCount - 1; i > 0; i--)
				{
					parameter.unshift(token.pop());
				}

				//If no parameters, set it to null otherwise client query will baulk			
				if ((parameter.length === 0) && (parameterCount === 0))
				{
					parameter = null;
				}
				//Collapse remaining tokens into the directory
				else
				{
					parameter.unshift(token.join("/"));
					//fill any remaining unmatched parameters with nulls
					while (parameter.length < parameterCount)
					{
						parameter.push(null);
					}
				}

				this.pool.connect((e, client, release) =>
				{
					if (e)
					{
						reject(e);
					}
					else
					{						
						client.query(sql, parameter)
						.then(res =>
						{
							console.log(`query returned ${res.rowCount} rows`);
							client.release();								
							resolve(res.rows);
						})
						.catch(e =>
						{
							client.release();
							reject(e);
						});
					}
				});
			}
			else
			{				
				reject(new Error(`Error undefined query operation '${key}'`));
			}
		});			
	}

	queryByObject(storedProcedure: string, ...parameter: (string|number)[]): Promise<any[]>
	{
		return new Promise<any[]>((resolve, reject) =>
		{
			const sql = this.queryMap.get(storedProcedure);
			if (sql)
			{
				if (parameter.length == 0)
				{
					parameter = null;
				}
				this.pool.connect((e, client, release) =>
				{
					if (e)
					{
						reject(e);
					}
					else
					{	
						let start = performance.now();				
						client.query(sql, parameter)
						.then(res =>
						{							
							client.release();								
							resolve(res.rows);
						})
						.catch(e =>
						{
							client.release();
							reject(e);
						});
					}
				});	
			}
			else
			{
				reject(new Error(`Error undefined query operation '${storedProcedure}'`));
			}
		});
	}

	//Getting a tree requires client side parsing with tree builder.
	//Perhaps this could be offloaded to the database server?
	getTree(cachePath: string): Promise<{tree: Object, frameBuffer: FrameBuffer}>
	{
		return new Promise<{tree: Object, frameBuffer: FrameBuffer}>((resolve, reject) =>
		{
			this.pool.connect((e, client, release) =>
			{
				if(e)
				{
					reject(e);
				}
				else
				{
					client.query('select * from get_directories()')
					.then(res =>
					{
						client.release();
						let frameBuffer: FrameBuffer = new FrameBuffer(cachePath, this);
						let tree = new TreeBuilder();
						for (let i: number = 0; i < res.rowCount; i++) {							
							tree.addItem(res.rows[i]);
							frameBuffer.addExperiment(res.rows[i]);							
						}						
						resolve({tree: tree.getTree(), frameBuffer});
					})
					.catch(e =>
					{
						client.release();
						reject(e);
					});
				}
			});
		});
	}

	//TODO roll this up into query() and delete.
	getOperations(res: http.ServerResponse)
	{
		this.pool.connect((err, client, release) =>
		{
			if (err)
			{
				return console.error('Error acquiring client', err.stack);
			}
			client.query('select * from seg_view where seg_value is not null', (err, result) =>
			{
				release();
				if (err)
				{
					return console.error('Error executing query', err.stack);
				}
				res.write(JSON.stringify(result.rows, null, 3) + '\n');
				res.end();
			});
		});
	}

	dbListen(setController: SetController)
	{
		let conn: pg.ClientConfig = {
			host: 'phoebe.rcc.uq.edu.au',
			database: 'phoebe_prod',
			port: 1338,
			user: this.userName,
			password: this.password,			
		}

		let pgClient = new pg.Client(conn);
		pgClient.connect((e: Error) =>
		{
			if (e)
			{
				console.log(`dbListen error connecting ${e}`);
			}
			else
			{
				pgClient.query(`listen "proc_status"`, (e: Error) =>
				{
					if (e) console.log(`error listening to DB server\n${JSON.stringify(e, null, 3)}`);
				});
				pgClient.on('notification', (message: any) =>
				{					
					setController.processDBMessage(message.payload);
				});
			}
		});
	}
}

//TODO this is not picking things up from the pool
export class SocketIO
{

	readonly socketServer: ws.Server;
	readonly socketMap: Map<string, ws>;
	readonly pgClient: pg.Client;

	constructor(httpServer: http.Server)
	{
		// this.socketServer = new ws.Server({ server: httpServer });
		// this.socketMap = new Map<string, ws>();
		// this.socketServer.on('connection', (webSocket: ws) =>
		// {
		// 	webSocket.on('message', (m: ws.Data) => this.onMessage(m, webSocket));
		// });


		let conn: pg.ClientConfig = {
			//host: '203.101.226.113',
			host: 'phoebe.rcc.uq.edu.au',
			port: 1338,
			//database: 'phoebe',
			database: 'phoebe_prod',
			user: 'phoebeuser',
			password: 'user',
		}

		this.pgClient = new pg.Client(conn);
		this.pgClient.connect((e: Error) =>
		{
			if (e)
			{
				console.log(`error connecting ${e}`);
			}
			else
			{
				console.log(`connected to socket`);
				this.pgClient.query(`listen "proc_status"`, (e: Error) =>
				{
					if (e) console.log(`error listening to DB server\n${JSON.stringify(e, null, 3)}`);
				});
				this.pgClient.on('notification', (message: any) =>
				{
					let msgObj: any = JSON.parse(message.payload);
					let socket: ws = this.socketMap.get(msgObj.channel_id);
					if (socket)
					{
						socket.send(message.payload);						
					}
					else
					{
						console.log(`no socket found ${msgObj.channel_id}`);			
					}
				});
			}
		});
	}

	//Picks up registration from browser.
	//TODO: unregister and re-resiter.
	private onMessage(m: ws.Data, webSocket: ws): void
	{
		const msgObj: any = JSON.parse(m as string);
		if (msgObj.operation === 'register')
		{
			console.log(`registering ${JSON.stringify(msgObj.record)}`);
			const rec: ChannelRecord = msgObj.record as ChannelRecord;
			const params: any = [rec.directory, rec.channel, rec.segValue];
			this.pgClient.query('select * from get_work_id($1, $2, $3)',
				params, (e: Error, result: pg.QueryResult) =>
				{
					if (e)
					{
						console.log(`failed to get work id\n ${JSON.stringify(e, null, 3)}`);
					}
					else
					{
						let channelID: string = result.rows[0].get_work_id;
						this.socketMap.set(channelID, webSocket);
						this.pgClient.query('select enqueue_work($1, $2, $3)', params, (e: Error) =>
						{
							if (e)
							{
								console.log(`Error enqueing work:\n${JSON.stringify(e, null, 3)}`);
							}
						});
					}
				});
		}
	}

	private printMap(): void
	{
		this.socketMap.forEach((v, k, m) =>
		{
			console.log(`key: ${k} value: ${v}`);
		});
		console.log();
	}

}

// Wrap this functionality up into frame-buffer class and remove.
export class TreeBuilder
{
    private idCounter: number = 1;
    private sMap: Map<string, number> = new Map();
    private jString: any[] = [];

    addItem(record: any): void {
        const entry: string[] = record.directory.split("/");
        for (let i: number = 0; i < entry.length - 1; i++) // Truncating last directory
        {
            const key: string = entry.slice(0, i + 1).join("/");
            if (!this.sMap.has(key)) {
                this.sMap.set(key, this.idCounter++);
				if (i === 0)
				{
                    this.jString.push({ id: this.sMap.get(key), parent: "#", text: entry[i], type: "f-closed" });
                }
				else
				{
                    const parentKey: string = entry.slice(0, i).join("/");
                    if (this.sMap.has(parentKey)) {
                        const parentID: number = this.sMap.get(parentKey);
                        if (i === entry.length - 2) // We have a child node
                        {
                            this.jString.push({ id: this.sMap.get(key), parent: parentID.toString(), text: entry[i], record: record});
                        }
						else
						{
                            this.jString.push({ id: this.sMap.get(key), parent: parentID.toString(), text: entry[i], type: "f-open" });
                        }
                    }
					else
					{
                        throw new Error("error parsing directory structure");
                    }
                }
            }
        }
    }

	getTree(): Object
	{
		return this.jString;
	}

    returnToReq(res: http.ServerResponse) {
        res.write(JSON.stringify(this.jString, null, 3));
        res.end();
    }

    print() {
        for (const entry of this.sMap) {
            console.log(JSON.stringify(this.jString, null, 3));
        }
    }
}