-- ZEMA — 0013_check_types_split.sql
--
-- ÖNCE 0012_check_type_values.sql ÇALIŞTIRILMIŞ OLMALI (ayrı "Run" —
-- Postgres yeni enum değerini aynı transaction'da kullanmaya izin vermez).
--
-- enqueue_report_checks() şimdiye kadar `enum_range(null::check_type)` ile
-- enum'daki HER değer için bir iş açıyordu. Bu, enum'a KALICI olarak yeni
-- bir değer eklemeyi ("language_template" gibi) ASLA çıkaramayacağınız
-- anlamına geliyordu — enum'dan değer SİLİNEMEZ, yani her yeni check_type
-- eklemek eskisini de sonsuza dek kuyruğa açık bırakırdı.
--
-- Artık AÇIKÇA hangi kontrollerin çalışacağı buraya yazılıyor —
-- lib/ai/config.ts CHECK_TYPES ile birebir aynı liste, elle senkron tutulur.
-- `language_template` bu listede YOK: run-check.ts artık onu işleyecek bir
-- kod yolu içermiyor, kuyruğa açılırsa sonsuza dek pending kalırdı.

create or replace function enqueue_report_checks(p_report_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into analysis_jobs (report_id, check_type)
  select p_report_id, ct
    from unnest(array[
      'required_sections',
      'template_compliance',
      'language_check',
      'title_content',
      'category_fit',
      'similarity',
      'criteria_scoring',
      'feedback_synthesis'
    ]::check_type[]) as ct
  on conflict (report_id, check_type) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end
$$;

comment on function enqueue_report_checks(uuid) is
  'Aktif check_type listesi için bir pending iş açar (lib/ai/config.ts CHECK_TYPES ile elle senkron). Idempotent.';

-- Yetkiler zaten 0004'te service_role'e verilmişti; create or replace bunu korur.
