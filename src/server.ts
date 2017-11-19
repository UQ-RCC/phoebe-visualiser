import * as http from "http";
import * as jss from "json-stringify-safe";
import * as db from "./database";

export function createLocalServer()
{  
    
    let dbIO = db.DBIO.getInstance();
    
    let server = http.createServer((req, res) => {
                
        let remoteAddress = req.connection.remoteAddress;
        
        if (req.headers.host !== 'localhost')
        {
            res.end
        }
        else
        {
            if (req.url.startsWith("/db"))
            {
                console.log(`request ${req.url}`);
                res.writeHead(200, {"Content-Type": 'text/plain'});
                dbIO.query(req.url.replace("/db/","")).then(rslt =>
                {
                    res.write(JSON.stringify(rslt, null, 3));                    
                    res.end(); 
                });
            }
            else
            {
                res.end;
            }
        }
    });
    
    server.listen(80);
    console.log('server listening');

}