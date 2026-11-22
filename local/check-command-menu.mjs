import {loadCredentials} from './credentials.mjs';
const {token,chatId}=loadCredentials();
const response=await fetch(`https://api.telegram.org/bot${token}/getMyCommands`,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({scope:{type:'chat',chat_id:Number(chatId)}}),signal:AbortSignal.timeout(15000),
});
const data=await response.json();
if(!data.ok)throw new Error('Telegram command-menu check failed');
const names=data.result.map(c=>c.command);
console.log('Telegram commands:',names.join(', '));
if(!names.includes('new')||!names.includes('archive'))throw new Error('New commands are not registered yet');
