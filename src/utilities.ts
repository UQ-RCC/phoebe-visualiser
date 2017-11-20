import * as os from 'os';
import * as numeral from 'numeral';
import * as request from 'request';

// Parse object and convert numeric properties to formatted MB strings
export function numToMB(o: any): Object
{
	if (typeof o == 'number')
	{
		return numeral(o as number / 1024 ** 2).format('0, 0.00') + 'MB';
	}

	if (Array.isArray(o))
	{
		let out: Object[] = [];
		o.map(v => out.push(numToMB(v)));
		return out;
	}
	else
	{
		let out: Object = new Object();
		for (let p in o)
		{			
			let pd = Object.getOwnPropertyDescriptor(o, p);
			if (typeof pd.value === 'number')
			{
				pd.value = numeral(pd.value / 1024 ** 2).format('0, 0.00') + 'MB';
			}
			Object.defineProperty(out, p, pd);
		}
		return out;
	}
}

export function numTo(o: any): Object
{
	if (typeof o == 'number')
	{
		return numeral(o as number).format('0,');
	}

	if (Array.isArray(o))
	{
		let out: Object[] = [];
		o.map(v => out.push(numToMB(v)));
		return out;
	}
	else
	{
		let out: Object = new Object();
		for (let p in o)
		{			
			let pd = Object.getOwnPropertyDescriptor(o, p);
			if (typeof pd.value === 'number')
			{
				pd.value = numeral(pd.value).format('0,');
			}
			Object.defineProperty(out, p, pd);
		}
		return out;
	}
}

abstract class AbstractGetter
{
	protected readonly ioPool: IOPool;
	protected readonly id: number;
	protected key: string;
	
	constructor(xhrPool: IOPool, id: number)
	{
		this.ioPool = xhrPool;
		this.id = id;
	}

	//Retrive data buffer from source
	abstract getBuffer(key: string): void

	getID(): number
	{
		return this.id;
	}
	
}

class RequestGetter extends AbstractGetter
{
	getBuffer(key: string)
	{	
		request({url: this.key, encoding: null}, (error, response, body) =>
		{
						
		});	
	}
}

export class DummyGetter extends AbstractGetter
{
	private readonly bufferSize = (1024 ** 2) * 150;
	getBuffer(key: string): void
	{
		let sleep = Math.floor(Math.random() * 1000)
		setTimeout(() => {
			this.ioPool.addBuffer(Buffer.alloc(this.bufferSize), key);		
			console.log(`${key}, ${sleep}, ${this.id}, ${os.freemem()}`);
			this.ioPool.returnHandler(this);
		}, sleep);
	}
}

class XHRArrayGetter extends AbstractGetter
{

	private readonly req: XMLHttpRequest;	

	constructor(ioPool: IOPool, id: number)
	{	
		super(ioPool, id);		
		this.req = new XMLHttpRequest();
		this.req.responseType = "arraybuffer";
		this.req.onload = () =>
		{
			let inBuffer: ArrayBuffer = this.req.response;
			if (inBuffer)
			{
				// this.xhrPool.addBuffer(inBuffer.slice(0), this.key);
				inBuffer = null;
				ioPool.returnHandler(this);
			}
		}
	}

	getBuffer(key: string)
	{
		this.key = key;
		this.req.open("GET", key, true);
		this.req.send();
	}
	
}

export class IOPool
{

	private bufferMap: Map<string, Buffer>;
	private requests: string[]
	private handlers: AbstractGetter[];
	private totalByteLength: number;
	private maxSize = (1024 ** 3) * 3;
	private handlerClass: any;

	private create<T>(c: {new(f: IOPool, id: number): T}, id: number): T
	{		
		return new c(this, id);
	}
	
	constructor(handlers: number, handler: any)
	{
		this.handlerClass = handler;
		this.bufferMap = new Map<string, Buffer>();
		this.requests = []
		this.handlers = [];
		this.totalByteLength = 0;
		for (let i: number = 0; i < handlers; i++)
		{			
			this.handlers.push(this.create(this.handlerClass, i));
		}
	}

	public addReqest(address: string): void
	{		
		this.requests.push(address);
		this.process();
	}

	private process()
	{
		let handler = this.handlers.pop();
		if (handler)
		{
			let req = this.requests.shift();
			if (req)
			{				
				handler.getBuffer(req);
			}
			else
			{
				this.handlers.push(handler);
			}
		}		
	}

	public getBufferMap(): Map<string, Buffer>
	{
		return this.bufferMap;
	}

	public returnHandler(handler: AbstractGetter)
	{
		let before = this.handlers.length;
		this.handlers.push(handler);		
		this.process();
	}

	public addBuffer(buffer: Buffer, key: string)
	{
		if (buffer.byteLength + this.totalByteLength > this.maxSize)
		{
			//this.deleteRandomBuffers(buffer.byteLength);
		}
		this.totalByteLength += buffer.byteLength;
		this.bufferMap.set(key, buffer);
	}

	public deleteRandomBuffers(size: number)
	{
		if (this.bufferMap.size > 0)
		{
			const index: number = Math.floor((Math.random() * this.bufferMap.size));			
			const key: string = Array.from(this.bufferMap.keys())[index];			
			size -= this.bufferMap.get(key).byteLength;
			this.totalByteLength -= this.bufferMap.get(key).byteLength;
			let ab = this.bufferMap.get(key);
			ab = null;
			this.bufferMap.delete(key);			
			if (size > 0)
			{
				this.deleteRandomBuffers(size);
			}
		}
	}
}
