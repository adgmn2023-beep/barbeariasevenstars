export default function Page() {
  return (
    <article className="card narrow prose">
      <p className="eyebrow">SEUS DADOS, COM RESPEITO</p>
      <h1>Política de privacidade</h1>
      <p>
        A Seven Stars Barbershop utiliza nome, telefone, e-mail e data de
        nascimento para identificar clientes, administrar agendamentos e prestar
        atendimento. O aceite desta política é registrado no cadastro.
      </p>
      <h2>Como usamos seus dados</h2>
      <p>
        Seu histórico é acessível por você e pelo administrador. Horários
        disponíveis são públicos, mas nunca revelam a identidade de clientes.
        Usamos Supabase para autenticação e armazenamento e Vercel para hospedar
        o sistema. Esses fornecedores podem processar dados fora do Brasil.
      </p>
      <h2>Notificações e armazenamento local</h2>
      <p>
        As notificações são opcionais e podem ser desativadas no perfil ou
        navegador. Cookies mantêm sua sessão. O dispositivo armazena
        temporariamente a seleção de serviço e horário para permitir que você
        continue após entrar.
      </p>
      <h2>Seus direitos</h2>
      <p>
        Você pode consultar e corrigir dados pelo perfil, desativar notificações
        e excluir sua conta. Na exclusão, apagamos dados pessoais e agendamentos
        não concluídos. Mantemos somente os registros concluídos sem associação
        ao cliente para controle financeiro.
      </p>
      <h2>Contato e retenção</h2>
      <p>
        Para solicitar acesso, correção ou esclarecimentos, fale com o
        responsável da Seven Stars presencialmente na barbearia. Os dados são
        mantidos enquanto sua conta estiver ativa ou houver necessidade legal de
        conservação. Cópias de segurança dos provedores seguem seus próprios
        ciclos de retenção.
      </p>
      <p className="muted">Última atualização: 10 de outubro de 2026.</p>
    </article>
  );
}
