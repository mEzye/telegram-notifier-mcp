import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import WebSocket from 'ws';

// The existing Codex proxy transports a WebSocket stream over stdin/stdout.
// No TCP listener or additional app-server process is created.
export class CodexClient {
  constructor() { this.sequence=0; this.pending=new Map(); }
  async connect() {
    this.child=spawn('C:/Users/Admin/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe', ['app-server','proxy'], {windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child.stderr.resume();
    this.stream=Duplex.from({readable:this.child.stdout,writable:this.child.stdin});
    this.stream.setTimeout=()=>this.stream;
    this.stream.setNoDelay=()=>this.stream;
    this.stream.setKeepAlive=()=>this.stream;
    this.ws=new WebSocket('ws://localhost/',{createConnection:()=>this.stream,perMessageDeflate:false,handshakeTimeout:10000});
    const fail=()=>{
      for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Codex connection closed'));}
      this.pending.clear();
    };
    this.child.on('error',fail); this.ws.on('error',fail); this.ws.on('close',fail);
    this.ws.on('message',buffer=>{
      let m;try{m=JSON.parse(buffer.toString());}catch{return;}
      const p=this.pending.get(m.id);if(!p)return;
      this.pending.delete(m.id);clearTimeout(p.timer);
      if(m.error)p.reject(Object.assign(new Error(m.error.message),{code:m.error.code}));else p.resolve(m.result);
    });
    await new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',reject);});
    await this.call('initialize',{clientInfo:{name:'telegram-chat-commands',version:'1.0.0'},capabilities:{experimentalApi:true}});
    this.ws.send(JSON.stringify({method:'initialized'}));
  }
  call(method,params) {
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex request timed out'));},30000);
      this.pending.set(id,{resolve,reject,timer});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){this.ws?.terminate();this.child?.kill();}
}

export async function withCodex(action) {
  const client=new CodexClient();
  try{await client.connect();return await action(client);}finally{client.close();}
}
