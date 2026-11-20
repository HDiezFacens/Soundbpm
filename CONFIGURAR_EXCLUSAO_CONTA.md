# Publicar exclusão de conta

O botão **Excluir Conta** chama a Edge Function `delete-account`. A função valida a sessão da pessoa, remove os dados e arquivos dela e, por último, exclui o usuário do Supabase Auth. A chave administrativa fica somente no servidor.

No Terminal, dentro da pasta do projeto, publique a função no projeto SoundBPM:

```sh
supabase functions deploy delete-account --project-ref mfpjuyqcieqtcdbkvgwu
```

O ambiente das Edge Functions do Supabase fornece as chaves do projeto. Não coloque a `service_role` ou `secret key` no site.

Depois, publique também os arquivos do site. A pessoa encontrará o botão no próprio perfil, abaixo de **Sair da Conta**. A exclusão pede confirmação e remove permanentemente a conta e os dados associados.
