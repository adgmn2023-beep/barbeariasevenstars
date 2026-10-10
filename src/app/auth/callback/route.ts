import {NextResponse} from 'next/server';
import {serverDb} from '@/lib/supabase/server';
import {safeNext} from '@/lib/validation';
export async function GET(request:Request){const url=new URL(request.url);const code=url.searchParams.get('code');if(code){const db=await serverDb();const {error}=await db.auth.exchangeCodeForSession(code);if(!error){const {data:{user}}=await db.auth.getUser();const {data:p}=await db.from('profiles').select('*').eq('id',user!.id).single();const next=safeNext(url.searchParams.get('next'));return NextResponse.redirect(new URL(!p?.telefone||!p?.data_nascimento||!p?.privacy_accepted_at?`/completar-cadastro?next=${encodeURIComponent(next)}`:next,url.origin));}}return NextResponse.redirect(new URL('/login?erro=link',url.origin));}
