import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin} from '@/lib/admin';
import {privilegedDb} from '@/lib/supabase/server';
import {statusSchema,readableError} from '@/lib/validation';
import {canTransition} from '@/lib/schedule';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdmin();const id=z.uuid().parse((await params).id);const body=statusSchema.parse(await request.json());const db=privilegedDb();const {data:old,error:readError}=await db.from('appointments').select('*').eq('id',id).single();if(readError)throw readError;if(!canTransition(old.status,body.status,old.end_at))throw new Error('Mudança de status não permitida. Aguarde o fim do atendimento para concluir ou marcar falta.');const {data,error}=await db.from('appointments').update({status:body.status,cancel_reason:body.status==='cancelado'?body.cancel_reason:null}).eq('id',id).eq('status',old.status).select().single();if(error)throw error;return NextResponse.json({appointment:data});}catch(e){return NextResponse.json({error:readableError(e)},{status:400});}}
