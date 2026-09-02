# Handoff — LUMADS CRM

## Estado atual

O CRM usa Supabase real para autenticação, clientes e aprovações. Dashboard, Clientes, Aprovações e Histórico foram validados com persistência após recarregar a página.

## Comunicações

O Supabase possui `agency_settings`, `message_templates`, `message_queue` e `message_events`, além dos campos de WhatsApp, e-mail e canal preferido dos clientes.

Em 02/09/2026 foram aplicadas as migrations `prepare_manual_communications_backend` e `enable_manual_email_mode`.

Elas implementam:

- autoria em `message_queue`;
- sincronização de timestamps de envio;
- preparação de comunicação manual por WhatsApp ou e-mail;
- confirmação de envio manual;
- cancelamento de comunicação manual;
- avanço de `followup_stage` para lembrete 1, lembrete 2 e aviso final;
- `email_mode = manual` nas configurações da agência.

## Integração de interface concluída

`communications-data.js` agora também integra o fluxo manual à interface existente sem refazer o restante do CRM.

O fluxo atual permite:

1. usar os templates reais do Supabase;
2. preparar mensagem inicial, lembrete 1, lembrete 2 e aviso final;
3. abrir WhatsApp com a mensagem pronta;
4. abrir o cliente de e-mail com assunto e mensagem prontos;
5. confirmar manualmente que o envio foi realizado;
6. registrar o envio em `message_queue`;
7. mostrar os registros em Últimos contatos;
8. avançar `followup_stage` após lembretes confirmados;
9. refletir os estágios de lembrete no Dashboard após a atualização dos dados;
10. impedir novos lembretes para aprovações já finalizadas.

A interface adiciona a opção de E-mail junto às ações de comunicação das aprovações e intercepta as ações de WhatsApp ligadas a uma aprovação para usar o fluxo registrado no Supabase.

## Próxima etapa

Executar validação local completa, sem refatorar o projeto:

- `npm run build`;
- testar mensagem inicial por WhatsApp;
- confirmar o envio e conferir Últimos contatos;
- testar mensagem inicial por e-mail;
- testar Lembrete 1 e Lembrete 2 em uma aprovação ativa;
- confirmar os indicadores do Dashboard após os lembretes;
- conferir F5 e persistência;
- revisar página por página apenas para identificar regressões.

## Limites atuais

- WhatsApp segue em modo manual. A mensagem é preparada e aberta, mas o CRM só registra o envio quando o usuário confirma.
- E-mail segue em modo manual. Envio automático por API ainda não está ativado.
- A regra de Última interação ainda será definida depois.
- Não refazer autenticação, CRUD de Clientes, CRUD/status de Aprovações ou Histórico salvo sem um erro reproduzível.
