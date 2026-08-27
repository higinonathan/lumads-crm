# LUMADS CRM

Protótipo frontend funcional para acompanhamento de aprovações de conteúdo de clientes da LUMADS. O projeto utiliza dados fictícios e persistência local no navegador, sem backend ou integrações externas.

## Executar localmente

Não há etapa de instalação. Com Python disponível, execute nesta pasta:

```bash
python -m http.server 4173
```

Depois, acesse `http://127.0.0.1:4173` no navegador.

## Estrutura

```text
.
├── index.html           # Estrutura, estilos e fontes locais
├── app.js               # Navegação e interações do frontend
└── Geist-*.ttf          # Pesos locais da Geist Sans
```

## Escopo atual

- Frontend estático e navegável.
- Dados de demonstração persistidos em `localStorage`.
- Temas claro, escuro e sistema.
- Sem Supabase, backend, autenticação ou automações.
