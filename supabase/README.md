# Supabase (multi-tenant)

O app agora assume um modelo **multi-tenant**: cada empresa é um `tenant` (identificado pelo subdomínio) e os dados são isolados por `tenant_id` via **RLS**.

## Como funciona no frontend

- O tenant é resolvido a partir do hostname:
  - `VITE_TENANT_SLUG` (override manual), senão:
  - subdomínio (`acme.seudominio.com` → `acme`), com fallback para `VITE_DEFAULT_TENANT_SLUG` (default: `default`).
- A tela de login usa `tenants` para carregar branding (nome/logo/cores) mesmo sem autenticação.

Env vars suportadas:

- `VITE_TENANT_SLUG` (opcional): força um tenant (útil em dev).
- `VITE_DEFAULT_TENANT_SLUG` (opcional): fallback em `localhost`/IP (default: `default`).
- `VITE_BASE_DOMAIN` (opcional): ajuda a extrair o slug (ex.: `example.com`).

## Importante: Supabase não tem environments

Recomendação prática:

- Crie **dois projetos Supabase**: `staging` e `prod`.
- Use `.env.local` para staging e `.env.production` (ou secret manager do CI) para prod.

## Migração / Schema

1. Aplique o SQL de `supabase/migrations/20251226000100_multitenant.sql` no SQL Editor do Supabase.
2. Crie um tenant por empresa (um por subdomínio):

```sql
insert into public.tenants (slug, company_name, primary_color, secondary_color, is_onboarded)
values ('acme', 'ACME', '#111827', '#06b6d4', true);
```

3. Adicione seu usuário como admin do tenant (pegue seu `auth.users.id`):

```sql
insert into public.tenant_members (tenant_id, user_id, role)
values (
  (select id from public.tenants where slug = 'acme'),
  'SEU_USER_ID_AQUI',
  'admin'
);
```

Sem isso, o app vai mostrar “Acesso não autorizado” após o login.

Se você estiver num Supabase “zerado”, a migração também cria uma tabela `public.products` mínima para o dashboard não quebrar.

## CSV import (upsert)

O onboarding faz `upsert` em `public.products` usando o par `(tenant_id, sku)` como chave. Garanta este índice único:

```sql
create unique index if not exists products_tenant_id_sku_uidx on public.products (tenant_id, sku);
```

## Importacao de clientes e vendas

Novas tabelas:

- `clients` (clientes)
- `sellers` (vendedores)
- `sales_orders` (cabecalho de vendas)
- `sales_items` (itens por pedido)

O app tem uma tela "Importar dados" (admin-only) que aceita cinco tipos de CSV:

- Produtos (tabela mestre): `sku`, `name`, `status`, `is_active`, `image_url`, `qty`, `price`, ...
- Clientes: `external_id`, `nome`, `email`, `telefone`, `cidade`, `ultima_compra`
- Vendedores: `external_id`, `nome`, `email`
- Vendas (Pedidos): `order_number`, `client_external_id`, `seller_external_id`, `status`, `total_amount`, `sold_at`
- Itens de venda: `order_number`, `sku`, `qty`, `unit_price`, `total_price`

O relacionamento e feito por `external_id` (clientes/vendedores), `order_number` (pedidos) e `sku` (itens -> produtos).
`sales_items` agora valida SKU existente e ativo na tabela `products`.

## Tenant invites (bootstrap admin)

Para criar um tenant via convite (sem SQL manual pelo usuario), gere um codigo e compartilhe com o cliente:

```sql
insert into public.tenant_invites (code, max_uses, expires_at)
values ('INVITE-ABC123', 1, now() + interval '7 days');
```

Para atrelar o convite a um slug especifico:

```sql
insert into public.tenant_invites (code, max_uses, allowed_slug, expires_at)
values ('INVITE-ACME', 1, 'acme', now() + interval '7 days');
```

Fluxo esperado:

- Usuario cria conta e acessa o slug desejado (subdominio ou `VITE_TENANT_SLUG`).
- Tela de "Empresa nao encontrada" solicita nome da empresa + codigo do convite (ou passe `?invite=CODIGO` na URL).
- O app cria o tenant e adiciona o usuario como admin.

Observacao: o slug precisa ter no maximo 32 caracteres.

## UI preset e tokens

O branding/tema do tenant é salvo em:

- `tenants.primary_color` / `tenants.secondary_color` (hex, usado em gráficos/gradientes)
- `tenants.ui_preset` (ex.: `clean`, `warm`, `dark`)
- `tenants.theme_tokens` (jsonb com CSS vars como `background`, `foreground`, `border`, `font-sans`, etc.)

Se você aplicou uma versão antiga do SQL, rode:

```sql
alter table public.tenants add column if not exists ui_preset text not null default 'clean';
alter table public.tenants add column if not exists theme_tokens jsonb not null default '{}'::jsonb;
```

## Se aparecer “infinite recursion detected in policy for relation tenant_members”

Isso acontece quando uma policy de `tenant_members` consulta a própria tabela (recursão de RLS). A migração já inclui a função `public.is_tenant_admin(...)` para evitar isso, mas se você rodou uma versão antiga do SQL, rode este patch:

```sql
create or replace function public.is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;

drop policy if exists "Tenant admins can list members" on public.tenant_members;
create policy "Tenant admins can list members"
on public.tenant_members
for select
using (public.is_tenant_admin(tenant_members.tenant_id));

drop policy if exists "Tenant admins can add members" on public.tenant_members;
create policy "Tenant admins can add members"
on public.tenant_members
for insert
with check (public.is_tenant_admin(tenant_members.tenant_id));

drop policy if exists "Tenant admins can remove members" on public.tenant_members;
create policy "Tenant admins can remove members"
on public.tenant_members
for delete
using (public.is_tenant_admin(tenant_members.tenant_id));

drop policy if exists "Tenant admins can update" on public.tenants;
create policy "Tenant admins can update"
on public.tenants
for update
using (public.is_tenant_admin(tenants.id))
with check (public.is_tenant_admin(tenants.id));
```
