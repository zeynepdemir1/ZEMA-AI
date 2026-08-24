'use client';

import { useState, useTransition } from 'react';
import { createCategory, deleteCategory, updateCategory } from './actions';

type Category = { id: string; name: string; description: string; reportCount: number };

function EditRow({
  category,
  onDone,
}: {
  category: Category;
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const r = await updateCategory(category.id, { name, description });
      if (r.ok) onDone();
      else setError(r.error ?? 'Kaydedilemedi.');
    });
  }

  return (
    <div className="border-ink/[.18] border bg-white px-3 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Kategori adı"
        className="border-ink/[.18] text-ink mb-2 w-full border bg-white px-3 py-2 font-sans text-[13.5px]"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Açıklama — kategori sınıflandırması bu metinden yapılır"
        rows={2}
        className="border-ink/[.18] text-ink mb-2 w-full resize-none border bg-white px-3 py-2 font-sans text-[13px] leading-[1.5]"
      />
      {error && <div className="text-danger mb-2 text-[12.5px]">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="bg-ink cursor-pointer border-none px-3 py-1.5 font-mono text-[11px] text-white disabled:opacity-50"
        >
          {pending ? 'KAYDEDİLİYOR…' : 'KAYDET'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDone}
          className="border-ink/[.22] text-ink/75 cursor-pointer border bg-white px-3 py-1.5 font-mono text-[11px] disabled:opacity-50"
        >
          İPTAL
        </button>
      </div>
    </div>
  );
}

function AddRow({ competitionId, onDone }: { competitionId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd() {
    setError(null);
    startTransition(async () => {
      const r = await createCategory(competitionId, { name, description });
      if (r.ok) {
        setName('');
        setDescription('');
        onDone();
      } else {
        setError(r.error ?? 'Eklenemedi.');
      }
    });
  }

  return (
    <div className="border-ink/[.28] bg-ink/[.02] mb-1.5 border border-dashed px-3 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Yeni kategori adı"
        className="border-ink/[.18] text-ink mb-2 w-full border bg-white px-3 py-2 font-sans text-[13.5px]"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Açıklama — kategori sınıflandırması bu metinden yapılır"
        rows={2}
        className="border-ink/[.18] text-ink mb-2 w-full resize-none border bg-white px-3 py-2 font-sans text-[13px] leading-[1.5]"
      />
      {error && <div className="text-danger mb-2 text-[12.5px]">{error}</div>}
      <button
        type="button"
        disabled={pending || !name.trim() || !description.trim()}
        onClick={onAdd}
        className="bg-ink cursor-pointer border-none px-3 py-1.5 font-mono text-[11px] text-white disabled:opacity-50"
      >
        {pending ? 'EKLENİYOR…' : '+ KATEGORİ EKLE'}
      </button>
    </div>
  );
}

export function CategoriesCard({
  competitionId,
  categories,
}: {
  competitionId: string;
  categories: Category[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; msg: string } | null>(null);
  const [, startTransition] = useTransition();

  function onDelete(cat: Category) {
    // Rapor varsa önden ENGELLEMİYORUZ — tıklanabilir kalıyor, gerçek
    // engelleme sebebi sunucudan dönüp deleteError'da görünüyor. Önceki
    // hâlde buton sessizce disabled'dı; kullanıcıya hiçbir açıklama
    // görünmediği için "silme çalışmıyor" gibi geliyordu.
    if (!window.confirm(`"${cat.name}" kategorisini silmek istediğinize emin misiniz?`)) return;
    setDeleteError(null);
    setDeletingId(cat.id);
    startTransition(async () => {
      const r = await deleteCategory(cat.id);
      setDeletingId(null);
      if (!r.ok) setDeleteError({ id: cat.id, msg: r.error ?? 'Silinemedi.' });
    });
  }

  return (
    <div className="border-ink/10 border bg-white p-[26px]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-ink/75 font-mono text-[10.5px] tracking-[.12em]">KATEGORİLER</span>
        <span className="text-ink/[.45] font-mono text-[11px]">{categories.length} ADET</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {categories.length === 0 ? (
          <div className="text-ink/75 text-[13px]">Tanımlı kategori yok.</div>
        ) : (
          categories.map((c) =>
            editingId === c.id ? (
              <EditRow key={c.id} category={c} onDone={() => setEditingId(null)} />
            ) : (
              <div key={c.id} className="border-ink/[.12] border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{c.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-ink/[.45] font-mono text-[10.5px]">{c.reportCount} RAPOR</span>
                    <button
                      type="button"
                      onClick={() => setEditingId(c.id)}
                      className="border-ink/[.22] text-ink/75 cursor-pointer border bg-white px-2 py-1 font-mono text-[10px]"
                    >
                      DÜZENLE
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => onDelete(c)}
                      className="border-danger text-danger cursor-pointer border bg-white px-2 py-1 font-mono text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === c.id ? '…' : 'SİL'}
                    </button>
                  </div>
                </div>
                {deleteError?.id === c.id && (
                  <div className="text-danger mt-1.5 text-[12px]">{deleteError.msg}</div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div className="mt-3">
        {adding ? (
          <AddRow competitionId={competitionId} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border-ink/[.22] text-ink/75 hover:bg-ink/[.02] w-full cursor-pointer border border-dashed bg-white py-2.5 font-mono text-[11px] tracking-[.08em]"
          >
            + YENİ KATEGORİ EKLE
          </button>
        )}
      </div>
    </div>
  );
}
