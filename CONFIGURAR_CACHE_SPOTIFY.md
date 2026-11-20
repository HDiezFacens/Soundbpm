# Ativar o cache compartilhado do Spotify

O cache reduz chamadas repetidas à API e permite servir resultados guardados quando o Spotify limita ou falha. Ele não aumenta a quota da conta Spotify.

1. No Supabase, abra **SQL Editor**, cole e execute o conteúdo de `supabase_spotify_search_cache.sql`.
2. No Terminal, na pasta do projeto (`Soundbpm`), publique a Edge Function:

   ```sh
   npx supabase functions deploy spotify-search --project-ref mfpjuyqcieqtcdbkvgwu
   ```

3. Confira se a função tem os secrets `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` configurados. `SUPABASE_URL` e a chave de serviço são fornecidos pelo ambiente Supabase. Não coloque a chave de serviço no site.

As buscas comuns ficam em cache por 12 horas, `tag:new` por 2 horas e faixas de álbum por 7 dias. Cópias expiradas são mantidas por até 7 dias para fallback em caso de falha do Spotify. O site continua usando o iTunes quando não há resultado disponível.
