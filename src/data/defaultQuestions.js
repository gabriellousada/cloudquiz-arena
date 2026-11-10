export const DEFAULT_CLOUD_QUESTIONS = [
  {
    objectId: 'q_cloud_1',
    category: 'Modelos de Serviço em Nuvem',
    difficulty: 'easy',
    question:
      'Qual modelo de computação em nuvem fornece ao desenvolvedor recursos de infraestrutura fundamentais, como máquinas virtuais, redes e armazenamento em bloco, permitindo controle sobre o sistema operacional?',
    options: [
      'IaaS (Infrastructure as a Service)',
      'SaaS (Software as a Service)',
      'FaaS (Function as a Service)',
      'BaaS (Backend as a Service)',
    ],
    correctIndex: 0,
    explanation:
      'No modelo IaaS (como AWS EC2, Google Compute Engine e Azure Virtual Machines), o provedor gerencia a infraestrutura física e a virtualização, enquanto o cliente gerencia o sistema operacional, middlewares e aplicações.',
  },
  {
    objectId: 'q_cloud_2',
    category: 'Escalabilidade e Elasticidade',
    difficulty: 'easy',
    question:
      'Em computação em nuvem, qual é a diferença fundamental entre escalabilidade vertical (Scale Up) e escalabilidade horizontal (Scale Out)?',
    options: [
      'Scale Up adiciona mais servidores ao cluster, enquanto Scale Out aumenta a memória RAM de um único servidor',
      'Scale Up aumenta os recursos (CPU/RAM) de uma instância existente, enquanto Scale Out adiciona novas instâncias para distribuir a carga',
      'Scale Up funciona apenas em nuvens privadas e Scale Out funciona apenas em nuvens públicas',
      'Scale Up reduz o custo operacional automaticamente, enquanto Scale Out desativa o balanceador de carga',
    ],
    correctIndex: 1,
    explanation:
      'A escalabilidade vertical (Scale Up) amplia a capacidade de uma única máquina, enquanto a escalabilidade horizontal (Scale Out) adiciona mais nós ou instâncias atrás de um Load Balancer, garantindo maior tolerância a falhas.',
  },
  {
    objectId: 'q_cloud_3',
    category: 'PaaS e BaaS',
    difficulty: 'medium',
    question:
      'Qual é o principal benefício de adotar uma plataforma BaaS (Backend as a Service) no desenvolvimento de aplicações web e móveis modernas?',
    options: [
      'Exigir que a equipe configure manualmente servidores físicos, roteadores e cabos de rede',
      'Abstrair serviços recorrentes de backend — como autenticação, banco de dados, APIs e notificações em tempo real — acelerando a entrega do produto',
      'Substituir completamente a necessidade de uma interface gráfica (frontend) para o usuário final',
      'Impedir que a aplicação utilize conexões seguras via protocolo HTTPS',
    ],
    correctIndex: 1,
    explanation:
      'O BaaS fornece componentes de backend prontos via SDKs e APIs (autenticação, persistência, controle de acesso e sincronização em tempo real), permitindo que a equipe foque nas regras de negócio e na experiência do usuário.',
  },
  {
    objectId: 'q_cloud_4',
    category: 'Virtualização e Contêineres',
    difficulty: 'medium',
    question:
      'Por que contêineres são considerados mais leves e iniciam mais rápido do que Máquinas Virtuais (VMs) tradicionais?',
    options: [
      'Porque contêineres não precisam de processador nem de memória RAM para executar aplicações',
      'Porque contêineres compartilham o mesmo kernel do sistema operacional hospedeiro, isolando apenas os processos e dependências da aplicação',
      'Porque cada contêiner emula um hardware físico completo com BIOS e sistema operacional próprio de vários gigabytes',
      'Porque contêineres só podem executar arquivos de texto estáticos sem código compilado',
    ],
    correctIndex: 1,
    explanation:
      'Enquanto cada Máquina Virtual carrega um sistema operacional convidado (Guest OS) completo sobre um hipervisor, os contêineres compartilham o kernel do host utilizando namespaces e cgroups, reduzindo drasticamente o consumo de recursos.',
  },
  {
    objectId: 'q_cloud_5',
    category: 'Engenharia DevOps e CI/CD',
    difficulty: 'medium',
    question:
      'Dentro de uma cultura DevOps, qual é o objetivo principal de uma pipeline de Integração Contínua (CI)?',
    options: [
      'Realizar deploys manuais em produção uma vez por semestre sem executar testes',
      'Validar frequentemente as alterações de código por meio de builds e testes automatizados a cada commit ou Pull Request, detectando falhas cedo',
      'Desativar o controle de versão Git para evitar conflitos entre desenvolvedores',
      'Aumentar a latência de rede entre o servidor de banco de dados e o cliente',
    ],
    correctIndex: 1,
    explanation:
      'A Integração Contínua (CI) automatiza a compilação e a execução de testes sempre que um código novo é enviado ao repositório, garantindo feedback rápido e evitando que erros cheguem ao ambiente de produção.',
  },
  {
    objectId: 'q_cloud_6',
    category: 'Segurança em Nuvem',
    difficulty: 'hard',
    question:
      'De acordo com o Modelo de Responsabilidade Compartilhada na nuvem, qual das opções abaixo é sempre responsabilidade do CLIENTE, independentemente de usar IaaS, PaaS ou SaaS?',
    options: [
      'A segurança física dos data centers e a manutenção dos geradores elétricos',
      'A substituição de discos rígidos defeituosos nos servidores físicos do provedor',
      'A gestão das credenciais de acesso dos usuários, políticas de permissão e a proteção dos dados da própria aplicação',
      'A atualização do firmware dos roteadores de borda da infraestrutura global do provedor',
    ],
    correctIndex: 2,
    explanation:
      'O provedor de nuvem é responsável pela "segurança DA nuvem" (infraestrutura física), mas o cliente retém sempre a responsabilidade pela "segurança NA nuvem" no que tange aos seus próprios dados, contas de usuários e permissões de acesso.',
  },
  {
    objectId: 'q_cloud_7',
    category: 'Arquitetura Serverless e FaaS',
    difficulty: 'hard',
    question:
      'Qual característica define corretamente o modelo de computação Serverless (FaaS - Function as a Service)?',
    options: [
      'O código é executado em funções orientadas a eventos que escalam automaticamente até zero quando ociosas, cobrando apenas pelo tempo real de execução',
      'O desenvolvedor aluga um servidor dedicado 24 horas por dia e paga mesmo quando não há nenhuma requisição',
      'As funções são executadas sem utilizar servidores físicos em nenhum lugar do mundo',
      'O cliente precisa instalar manualmente patches de segurança no kernel Linux a cada semana',
    ],
    correctIndex: 0,
    explanation:
      'Em arquiteturas Serverless/FaaS, o provedor aloca recursos dinamicamente quando um evento ocorre, escala automaticamente conforme a demanda e cobra apenas pelos milissegundos de processamento utilizados.',
  },
  {
    objectId: 'q_cloud_8',
    category: 'Modelos de Implantação',
    difficulty: 'easy',
    question:
      'Uma organização que mantém dados sensíveis em um data center próprio (on-premises), mas utiliza serviços de uma nuvem pública para absorver picos de tráfego sazonal, está adotando qual modelo de implantação?',
    options: [
      'Nuvem Híbrida (Hybrid Cloud)',
      'Nuvem Comunitária Exclusiva',
      'Arquitetura Monolítica Offline',
      'Rede Local Isolada (LAN)',
    ],
    correctIndex: 0,
    explanation:
      'A Nuvem Híbrida combina infraestrutura privada (on-premises) com recursos de nuvem pública interconectados, permitindo práticas como Cloud Bursting para lidar com picos de demanda.',
  },
];
