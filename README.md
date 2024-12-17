# Discord Guilds Manager

Este é um projeto de aplicação web que permite aos usuários se autenticar via **Discord OAuth2** e visualizar as guildas em que são administradores, além de verificar se o **bot** está presente nessas guildas. A aplicação também armazena as guildas em cache para melhorar a performance.

## Funcionalidades

- **Login via Discord**: Usuários podem se autenticar com sua conta do Discord para interagir com a API do Discord.
- **Visualização das Guildas Administradas**: Exibe as guildas em que o usuário tem permissões administrativas.
- **Verificação de Presença do Bot**: A aplicação verifica se o bot está presente nas guildas administradas pelo usuário.
- **Cache das Guildas**: As guildas do usuário são armazenadas em cache por 1 hora, evitando múltiplas requisições à API do Discord.
- **Exibição de Ícones e Avatares**: Exibe dinamicamente ícones de guildas e avatares de usuários (suporte para avatares animados).

## Tecnologias Utilizadas

- **Node.js** com **Express.js** para o servidor back-end.
- **OAuth2** para autenticação com Discord, utilizando **Passport.js**.
- **Axios** para realizar requisições HTTP à API do Discord.
- **Express-session** para gerenciar sessões de usuários.
- **Handlebars** como motor de templates para renderização da UI.
- **Cache em memória** para armazenar temporariamente as guildas e melhorar a performance.

## Pré-requisitos

Antes de rodar a aplicação, você precisa ter o seguinte:

- **Node.js** e **NPM** instalados na sua máquina.
- **Conta de Desenvolvedor do Discord** e um **bot registrado**.
- O **token do bot do Discord**.
