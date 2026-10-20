-- Alteração aplicada exclusivamente ao projeto Supabase da ONG.
-- Guarda fotos em um bucket PRIVADO e não expõe caminhos via API pública.
alter table public.criancas
  add column if not exists foto_storage_path text
    check (foto_storage_path is null or foto_storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('fotos-criancas-ame','fotos-criancas-ame',false,4194304,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=false, file_size_limit=4194304,
    allowed_mime_types=array['image/jpeg','image/png','image/webp'];

-- Imagens só são gravadas via Edge Function de gestão com JWT + perfil administrador.
-- Leitura externa só é possível por URL assinada e temporária dos perfis publicados.
