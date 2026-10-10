import type {Busy,Hours,Settings,Status} from './types';
export const TIMEZONE='America/Sao_Paulo';
export const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
export const localDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dateLabel=(date:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:TIMEZONE,dateStyle:'long'}).format(new Date(date));
export const timeLabel=(date:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(date));
export const statusLabels:Record<Status,string>={pendente:'Pendente',confirmado:'Confirmado',cancelado:'Cancelado',concluido:'Concluído',faltou:'Faltou'};
export function canTransition(from:Status,to:Status,end:string,now=new Date()){return from==='pendente'&&(to==='confirmado'||to==='cancelado')||from==='confirmado'&&(to==='concluido'||to==='faltou')&&new Date(end)<=now;}
export function availableSlots(date:string,duration:number,hours:Hours|undefined,settings:Settings,busy:Busy[],now=new Date()):string[]{
 if(!hours||hours.closed||duration<=0||settings.slot_step<=0)return [];
 const at=(time:string)=>new Date(`${date}T${time.slice(0,5)}:00-03:00`).getTime();
 const today=localDate(now);const max=new Date(`${today}T12:00:00-03:00`);max.setUTCDate(max.getUTCDate()+settings.booking_window);
 if(date<today||date>localDate(max))return [];
 const result:string[]=[];for(let start=at(hours.opens);start+duration*60000<=at(hours.closes);start+=settings.slot_step*60000){
 const end=start+duration*60000;
 if(start<now.getTime()+settings.min_notice*60000)continue;
 if(hours.lunch_start&&hours.lunch_end&&start<at(hours.lunch_end)&&end>at(hours.lunch_start))continue;
 if(busy.some(b=>start<new Date(b.end_at).getTime()&&end>new Date(b.start_at).getTime()))continue;
 result.push(new Date(start).toISOString());}return result;
}
