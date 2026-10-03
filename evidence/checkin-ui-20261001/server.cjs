const http=require('http'),fs=require('fs'),path=require('path');
const dir=__dirname;
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/student/')) { const upstream=http.request({hostname:'127.0.0.1',port:4174,path:req.url,method:'GET'},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});upstream.end();return; }
 const name=req.url==='/'?'index.html':req.url==='/qa.js'?'qa.js':null;
 if(!name){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(dir,name)));
});server.listen(4176,'127.0.0.1',()=>console.log('Layout review: http://127.0.0.1:4176/'));
