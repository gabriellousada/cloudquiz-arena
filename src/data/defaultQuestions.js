export const DEFAULT_CLOUD_QUESTIONS = [
  {
    objectId: 'q_cloud_1',
    category: 'Modelos de Nuvem (IaaS / PaaS / BaaS)',
    difficulty: 'easy',
    question:
      'Na arquitetura deste projeto, utilizamos a VPS da Oracle Cloud (OCI) para hospedar o sistema operacional Linux e o Back4App para autenticação e banco de dados pronto. Quais modelos de serviço em nuvem eles representam, respectivamente?',
    options: [
      'IaaS (Infrastructure as a Service) e BaaS (Backend as a Service)',
      'SaaS (Software as a Service) e IaaS (Infrastructure as a Service)',
      'PaaS (Platform as a Service) e FaaS (Function as a Service)',
      'BaaS (Backend as a Service) e CaaS (Container as a Service)',
    ],
    correctIndex: 0,
    explanation:
      'A VPS da Oracle Cloud fornece infraestrutura virtualizada (IaaS), enquanto o Back4App entrega autenticação, banco de dados, APIs REST/GraphQL e LiveQuery prontos para consumo pelo frontend (BaaS).',
  },
  {
    objectId: 'q_docker_2',
    category: 'Docker & Conteinerização',
    difficulty: 'medium',
    question:
      'Qual é a principal vantagem de utilizar Multi-Stage Build no Dockerfile de uma aplicação Vite/React em produção?',
    options: [
      'Executar o código React diretamente no kernel do Linux sem navegador',
      'Compilar os estáticos em um estágio Node.js e servir apenas a pasta dist/ em uma imagem leve Nginx Alpine',
      'Incluir todas as dependências de desenvolvimento (node_modules) na imagem final para acelerar o container',
      'Substituir a necessidade de um servidor web HTTP na porta 80',
    ],
    correctIndex: 1,
    explanation:
      'O Multi-Stage Build separa o ambiente de compilação (Node Alpine) do ambiente de execução (Nginx Alpine), reduzindo a imagem final de ~1GB para ~25MB e aumentando a segurança.',
  },
  {
    objectId: 'q_cicd_3',
    category: 'GitHub Actions & CI/CD',
    difficulty: 'medium',
    question:
      'No pipeline CI/CD (.github/workflows/ci-cd.yml), em qual momento o Webhook do Portainer na VPS Oracle Cloud deve ser acionado?',
    options: [
      'Imediatamente antes da execução do comando npm install',
      'Somente após o sucesso das etapas de Build (npm run build) e Testes Funcionais (Vitest)',
      'Apenas quando um teste unitário falha, para reiniciar o servidor',
      'Manualmente via acesso SSH na máquina virtual a cada commit',
    ],
    correctIndex: 1,
    explanation:
      'A Entrega Contínua (CD) garante que apenas código compilado e validado pelos testes automatizados seja promovido para produção via Webhook do Portainer.',
  },
  {
    objectId: 'q_baas_4',
    category: 'Segurança em BaaS (ACL & CLP)',
    difficulty: 'hard',
    question:
      'No Back4App (Parse Platform), como devemos configurar a ACL (Access Control List) de um registro na classe GameScore para que o Ranking Global funcione com segurança?',
    options: [
      'Public Read = false e Public Write = true para todos os usuários anônimos',
      'Public Read = true ("*": { read: true }) e permissão de escrita restrita apenas ao objectId do usuário autenticado',
      'Desativar todas as permissões de leitura e usar a Master Key exposta no código React',
      'Permitir escrita pública na tabela _User sem token de sessão',
    ],
    correctIndex: 1,
    explanation:
      'Com leitura pública ("*": { read: true }) qualquer jogador visualiza o placar global, enquanto a escrita restrita ao dono ([userId]: { write: true }) impede adulteração de pontuações de terceiros.',
  },
  {
    objectId: 'q_portainer_5',
    category: 'Orquestração & Portainer',
    difficulty: 'easy',
    question:
      'Qual é o papel do Portainer na arquitetura implantada na VPS da Oracle Cloud Infrastructure (OCI)?',
    options: [
      'Compilar arquivos JSX em JavaScript no navegador do cliente',
      'Gerenciar visualmente contêineres, Stacks (Docker Compose), volumes, logs e Webhooks de redeploy automático',
      'Substituir o banco de dados do Back4App por arquivos locais em texto puro',
      'Executar testes unitários do Vitest dentro do navegador do usuário',
    ],
    correctIndex: 1,
    explanation:
      'O Portainer atua como plataforma de gerenciamento visual para ambientes Docker, facilitando a administração de Stacks e disponibilizando Webhooks para atualização contínua.',
  },
  {
    objectId: 'q_realtime_6',
    category: 'Multiplayer & LiveQuery',
    difficulty: 'hard',
    question:
      'Para sincronizar em tempo real o estado das salas multiplayer e o ranking entre diferentes jogadores sem recarregar a página, qual recurso nativo do Back4App é utilizado?',
    options: [
      'Parse LiveQuery (WebSockets) integrado às classes MultiplayerRoom e GameScore',
      'Transferência de arquivos via protocolo FTP entre clientes',
      'Envio de e-mails transacionais a cada clique do jogador',
      'Reinicialização do contêiner Docker a cada jogada realizada',
    ],
    correctIndex: 0,
    explanation:
      'O Parse LiveQuery utiliza conexões WebSocket persistentes para notificar instantaneamente todos os clientes inscritos quando um objeto em MultiplayerRoom ou GameScore é criado ou atualizado.',
  },
];
