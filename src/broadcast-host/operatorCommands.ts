import commands from './operatorCommands.json';
export type OperatorCommand = typeof commands[number];
export function isOperatorCommand(value:string):boolean {
 if(value.length>80)return false;
 if(commands.includes(value))return true;
 if(/^color:#[a-f\d]{6}$/i.test(value)||/^radar-site:[a-z\d]{4}$/i.test(value))return true;
 if(/^seek:\d+$/.test(value))return Number(value.slice(5))<1000;
 if(value.startsWith('speed:')){const n=Number(value.slice(6));return Number.isFinite(n)&&n>=1&&n<=150;}
 return false;
}
