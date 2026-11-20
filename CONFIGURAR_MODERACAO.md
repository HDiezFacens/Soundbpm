# Ativar moderação de nomes e fotos

A moderação roda no servidor. O site envia o conteúdo para a Edge Function autenticada; só depois de aprovado a função salva a foto e atualiza o perfil. O trigger no banco bloqueia alterações diretas de nome, avatar ou banner sem uma aprovação emitida por essa função.

## Ativação no Supabase

1. No SQL Editor do projeto, execute o conteúdo de `supabase_profile_content_moderation.sql`.
2. Em **Edge Functions → Secrets**, adicione `OPENAI_API_KEY` com uma chave da API OpenAI. Não coloque essa chave no código do site nem no Git.
3. No terminal, na pasta do projeto, conecte o CLI ao projeto e publique a função:

   ```sh
   supabase login
   supabase link --project-ref mfpjuyqcieqtcdbkvgwu
   supabase functions deploy moderate-profile-content
   ```

4. Publique os arquivos do site atualizados.

O Supabase fornece as chaves de API do próprio projeto à Edge Function; não adicione a `service_role` como segredo manual. A função também autentica a sessão de quem solicita a moderação. Se a moderação estiver indisponível ou sem configuração, a alteração é recusada até poder ser verificada.

## Cobertura

Nomes novos ou alterados são verificados antes de serem salvos. Avatares e banners são enviados ao armazenamento público somente depois da análise da imagem. O modelo bloqueia conteúdo que sinalize como potencialmente nocivo, incluindo conteúdo sexual e violência gráfica; a análise automática pode ter falsos positivos e não substitui denúncias ou revisão humana para casos ambíguos. Conteúdo antigo não é reanalisado automaticamente por esta migração.
