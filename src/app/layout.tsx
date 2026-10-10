import './globals.css';
import {Shell} from '@/components/shell';
export const metadata = {title:'Seven Stars Barbershop',description:'Seu estilo, seu horário.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body><Shell>{children}</Shell></body></html>}
