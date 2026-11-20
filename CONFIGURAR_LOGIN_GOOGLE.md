# Configurar login com Google

O botão do Google usa o Supabase Auth. Ele só funcionará depois que o provedor for habilitado no Supabase com as credenciais OAuth. As credenciais ficam no painel do Supabase; não as coloque no código do site.

## 1. URLs de retorno do Supabase

No Supabase, abra **Authentication → URL Configuration**:

- Defina **Site URL** como o endereço público do SoundBPM.
- Em **Redirect URLs**, permita o endereço público do site e o endereço local usado para desenvolvimento, por exemplo `http://127.0.0.1:5500/**`.
- O site devolve a pessoa para a página em que iniciou o login. Esse endereço também precisa estar na lista permitida.

O callback que você cadastra no Google é diferente do endereço do site:

```text
  https://mfpjuyqcieqtcdbkvgwu.supabase.co/auth/v1/callback
```

## 2. Google

1. No Google Cloud Console, configure a tela de consentimento OAuth e crie um cliente OAuth do tipo **Web application**.
2. Em **Authorized JavaScript origins**, informe o domínio público do SoundBPM (sem caminho, por exemplo `https://soundbpm.com`). Para testes locais, inclua a origem local que você realmente usa.
3. Em **Authorized redirect URIs**, cole o callback do Supabase exibido acima.
4. No Supabase, abra **Authentication → Sign In / Providers → Google**, habilite Google e cole o **Client ID** e o **Client Secret** criados no Google.

Referência oficial: [Supabase — Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).
