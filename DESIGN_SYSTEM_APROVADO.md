# LUMADS CRM — Design System Aprovado

## Regra principal

O Dashboard atual é a fonte visual de verdade do LUMADS CRM.

Quando houver conflito entre estilos de Dashboard, Aprovações, Clientes, Histórico ou Configurações, o padrão visual do Dashboard vence.

Não criar novas paletas, novos tons estruturais, novos tamanhos de shell, novas regras de sidebar ou novas hierarquias tipográficas por página. As páginas podem ter layouts de conteúdo diferentes, mas shell, topbar, tipografia base, cores, superfícies, bordas, estados de navegação e tema devem derivar do Dashboard.

## O que está congelado como aprovado

### Estrutura desktop

- Sidebar: 245 px
- Sidebar padding: 28 px 18 px 22 px
- Main: 28 px 32 px 26 px
- Navegação: gap 8 px
- Item de navegação: 52 px de altura, padding 0 14 px, gap 14 px, border-radius 13 px
- Fonte de navegação: Outfit, 15 px, peso 500
- Logo LUMADS: Sora, 34 px, peso 800
- Logo CRM: 16 px, peso 700
- Título principal: Outfit, 31 px, peso 600
- Eyebrow: Outfit, 12 px, peso 600, uppercase, tracking .08em
- Botões e data da topbar: 44 px de altura, radius 12 px

### Cor principal

- Azul LUMADS: #0002FD

## Tema claro aprovado

### Estrutura

- Fundo geral: #f6f8fc
- Main: linear-gradient(180deg, #fbfbfd, #f6f8fc 70%)
- Sidebar: rgba(255,255,255,.98)
- Divisórias principais: #e7eaf1
- Painéis e cards: #ffffff
- Texto principal: #11162a / #182038
- Texto secundário: #4d5670
- Texto de apoio: #727a90

### Navegação

- Texto inativo: #515b76
- Hover: fundo #f5f7ff, texto #0002FD
- Ativo: linear-gradient(90deg, #edf2ff, #f5f7ff)
- Barra ativa: inset 3 px à esquerda em #0002FD

## Tema escuro aprovado

### Regra crítica

O Dashboard aprovado não usa superfícies estruturais pretas como #12161e para cabeçalhos de seções, filtros ou tabelas. O visual é azul-marinho profundo em camadas.

### Estrutura

- Fundo geral / shell: #081120
- Sidebar: #0b1424
- Borda da sidebar: #1f2c45
- Main: linear-gradient(180deg, #0b1424, #08111f)
- Painel/card principal: #0f1b2e
- Borda de painel/card: #21314f
- Divisórias internas: #22304c
- Controles de topbar: #0f1b2e
- Borda dos controles: #263657
- Campos internos podem usar #0c182a quando precisarem de uma camada mais profunda, mas essa cor não deve substituir o fundo do painel inteiro

### Texto

- Título e texto principal: #f4f7ff
- Texto secundário: #b9c2d6
- Texto de apoio: #96a1b8
- Eyebrow: #8B95A7

### Navegação escura

- Texto inativo: #aeb7cb
- Hover: fundo #102650, texto #7fa4ff
- Ativo: fundo #102a61, texto #7da0ff
- Barra ativa: inset 3 px à esquerda em #4c72ff
- Card do usuário: #0f1b2e
- Borda do card do usuário: #263657

## Painéis e cabeçalhos internos

A referência é o painel de acompanhamento do Dashboard:

- O painel inteiro usa a mesma superfície base
- O cabeçalho interno não recebe uma faixa preta independente
- No dark, cabeçalhos internos devem herdar a superfície #0f1b2e
- Tabela e cabeçalhos de tabela devem permanecer dentro da mesma linguagem visual do painel
- Em dark, o cabeçalho da tabela não deve introduzir #12161e como nova camada estrutural

## Tipografia interna

- Título de seção: 18 px, peso 600
- Texto de apoio: 13 px, peso 500
- Tabela: 11 px para cabeçalhos, 13 px para conteúdo
- Família principal: Outfit, fallback Geist, sans-serif

## Regra para novas páginas

1. Primeiro copiar shell, topbar, tipografia, cores e tema do Dashboard.
2. Depois criar apenas a geometria específica do conteúdo da nova página.
3. Nunca redefinir sidebar, logo, topbar, paleta global ou tema por página.
4. Nunca criar um segundo dark mode para uma página.
5. Se um ajuste visual parecer necessário, comparar primeiro com o Dashboard antes de alterar CSS.

## Arquitetura obrigatória daqui para frente

- Dashboard permanece congelado como referência visual.
- `lumads-design-system.css` deve ser a camada canônica compartilhada.
- CSS de página deve conter apenas o que é específico daquela página.
- Valores duplicados de shell, sidebar e paleta devem ser removidos gradualmente dos CSSs de página para impedir divergência.
- Codex ou qualquer outra ferramenta deve ler este arquivo antes de refinar o visual.

## Situação identificada em 04/09/2026

A divergência atual não é apenas visual. O projeto possui estilos aprovados do Dashboard dentro de `index.html`, enquanto Clientes mantém outro conjunto completo de shell e tema em `lumads-clients-page.css`. Além disso, `lumads-design-system.css` existia no repositório, mas não estava conectado ao runtime da aplicação. Isso permitiu que Aprovações e Clientes criassem superfícies como #12161e e outras variações de azul que não existem no Dashboard aprovado.

A correção correta é centralizar o padrão do Dashboard e fazer as demais páginas herdarem esse padrão, em vez de continuar aplicando remendos independentes por página.
