# Handoff — LUMADS CRM

## Estado atual

O CRM usa Supabase real para autenticação, clientes e aprovações. Dashboard, Clientes, Aprovações e Histórico foram validados com persistência após recarregar a página.

## Comunicações

O Supabase já possui `agency_settings`, `message_templates`, `message_queue` e `message_events`, além dos campos de WhatsApp, e-mail e canal preferido dos clientes.

Em 02/09/2026 foi aplicada a migration `prepare_manual_communications_backend`.

Ela acrescenta:

- autoria em `message_queue`;
- sincronização de timestamps de envio;
- preparação de comunicação manual por WhatsApp ou e-mail;
- confirmação de envio manual;
- cancelamento de comunicação manual;
- avanço de `followup_stage` para lembrete 1, lembrete 2 e aviso final.

O frontend de dados está em `communications-data.js`. A migration está versionada em `supabase/migrations/20260902_prepare_manual_communications_backend.sql`.

## Próxima etapa

Integrar `communications-data.js` à interface sem refazer as funcionalidades já validadas.

A interface deve passar a:

1. mostrar os envios em Últimos contatos;
2. permitir preparar WhatsApp e e-mail a partir da aprovação;
3. usar os templates do Supabase;
4. registrar a confirmação do envio;
5. refletir lembrete 1 e lembrete 2 no Dashboard;
6. manter ações indisponíveis quando o cliente não tiver o canal correspondente.

## Limites atuais

- WhatsApp segue em modo manual.
- E-mail automático por API ainda não está ativado.
- A regra de Última interação ainda será definida depois.
