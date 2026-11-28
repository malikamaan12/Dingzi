import { useState } from 'react';
import { Link } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, FolderOpen, Clock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useManagerMenu, refreshCafe } from '@/lib/managerMenu';
import { CATEGORY_MENU_GROUPS, type CategoryMenuGroupSetting } from '@shared/venueConfig';
import type { Category } from '@shared/schema';

const GROUP_LABELS: Record<CategoryMenuGroupSetting, string> = {
  auto: 'Auto-detect from title',
  food: 'Food & Mains',
  snacks: 'Snacks & Starters',
  drinks: 'Drinks & Coffee',
  sweets: 'Sweets & Bakery',
};

export default function AdminCategories() {
  const query = useManagerMenu(), { toast } = useToast();
  const [editor, setEditor] = useState<{
    id?: string;
    title: string;
    titleAr: string;
    menuGroup: CategoryMenuGroupSetting;
    isVisible: boolean;
    availableFrom: string;
    availableUntil: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [error, setError] = useState('');
  const data = query.data, cafe = data?.restaurant;
  const cats = [...(data?.categories || [])].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const count = (id: string) => data?.items.filter(i => i.categoryId === id).length || 0;
  const fail = (e: Error) => toast({ title: 'Could not update categories', description: e.message, variant: 'destructive' });

  const save = useMutation({
    mutationFn: async () => {
      if (!editor || !cafe) return;
      const title = editor.title.trim();
      if (!title) throw new Error('Enter a category name.');
      if (cats.some(c => c.id !== editor.id && c.title.toLowerCase() === title.toLowerCase())) {
        throw new Error('A category with this name already exists.');
      }
      const payload = {
        title,
        titleAr: editor.titleAr.trim() || null,
        menuGroup: editor.menuGroup,
        isVisible: editor.isVisible,
        availableFrom: editor.availableFrom.trim() || null,
        availableUntil: editor.availableUntil.trim() || null,
        ...(editor.id ? {} : { restaurantId: cafe.id, order: Math.max(-1, ...cats.map(c => c.order)) + 1 }),
      };
      await apiRequest(
        editor.id ? 'PUT' : 'POST',
        editor.id ? `/api/categories/${editor.id}` : '/api/categories',
        payload,
      );
    },
    onSuccess: async () => {
      setEditor(null);
      await refreshCafe();
      toast({ title: 'Category saved' });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggleVisibility = useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      apiRequest('PUT', `/api/categories/${id}`, { isVisible }),
    onSuccess: () => refreshCafe(),
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/categories/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      await refreshCafe();
      toast({ title: 'Category removed' });
    },
    onError: fail,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => apiRequest('PUT', '/api/category-order', { ids }),
    onSuccess: () => refreshCafe(),
    onError: fail,
  });

  function move(index: number, step: number) {
    const ids = cats.map(c => c.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    reorder.mutate(ids);
  }

  if (query.isLoading) return <p role="status">Loading categories…</p>;
  if (query.isError) return <div className="manager-panel p-8">Could not load categories. <Button onClick={() => query.refetch()}>Try again</Button></div>;
  if (!cafe) return <div className="manager-panel p-8"><Link href="/admin/restaurant">Create your café profile first →</Link></div>;

  return (
    <div className="space-y-6">
      <div className="manager-section-heading">
        <div>
          <p className="manager-eyebrow">ORGANIZE YOUR COLLECTION</p>
          <h1 className="text-2xl sm:text-3xl font-bold">Menu categories &amp; daypart schedules</h1>
          <p className="text-muted-foreground">
            {cats.length} categories · {data?.items.length} items. Toggle visibility or set optional Breakfast/Dinner time windows.
          </p>
        </div>
        <Button
          className="min-h-11 cursor-pointer"
          onClick={() => {
            setError('');
            setEditor({ title: '', titleAr: '', menuGroup: 'auto', isVisible: true, availableFrom: '', availableUntil: '' });
          }}
        >
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
          Create category
        </Button>
      </div>

      <div className="manager-panel p-3 sm:p-6 space-y-2">
        {cats.map((c, index) => (
          <div className="manager-category-row" key={c.id}>
            <span className="manager-category-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0" aria-hidden="true">
              <FolderOpen className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold">{c.title}</h2>
                {c.titleAr && (
                  <span dir="rtl" className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {c.titleAr}
                  </span>
                )}
                {c.menuGroup && c.menuGroup !== 'auto' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">
                    {c.menuGroup}
                  </span>
                )}
                {c.isVisible === false && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    <EyeOff className="w-3 h-3" aria-hidden="true" /> Hidden
                  </span>
                )}
                {(c.availableFrom || c.availableUntil) && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {c.availableFrom || '00:00'}–{c.availableUntil || '23:59'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {count(c.id)} items · {data?.items.filter(i => i.categoryId === c.id && i.isAvailable).length || 0} visible
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={c.isVisible === false ? `Show ${c.title}` : `Hide ${c.title}`}
                onClick={() => toggleVisibility.mutate({ id: c.id, isVisible: c.isVisible === false })}
              >
                {c.isVisible === false ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-primary" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Move ${c.title} up`} disabled={index === 0 || reorder.isPending || remove.isPending} onClick={() => move(index, -1)}>
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Move ${c.title} down`} disabled={index === cats.length - 1 || reorder.isPending || remove.isPending} onClick={() => move(index, 1)}>
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${c.title}`}
                onClick={() => {
                  setError('');
                  setEditor({
                    id: c.id,
                    title: c.title,
                    titleAr: c.titleAr || '',
                    menuGroup: ((c.menuGroup as CategoryMenuGroupSetting | null) || 'auto'),
                    isVisible: c.isVisible !== false,
                    availableFrom: c.availableFrom || '',
                    availableUntil: c.availableUntil || '',
                  });
                }}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Remove category ${c.title}`} onClick={() => setDeleting(c)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        {!cats.length && (
          <div className="p-8 text-center">
            <h2 className="font-semibold">Give your menu structure</h2>
            <p className="text-muted-foreground">Create categories such as Coffee, Breakfast, or Desserts.</p>
          </div>
        )}
      </div>

      <Dialog open={!!editor} onOpenChange={open => { if (!open && !save.isPending) setEditor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Edit category' : 'Create category'}</DialogTitle>
            <DialogDescription>Configure category title, visibility, and optional time-of-day serving hours.</DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); setError(''); save.mutate(); }} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="category-name">Category name (EN) *</Label>
                <Input
                  id="category-name"
                  required
                  maxLength={100}
                  autoFocus
                  value={editor?.title || ''}
                  onChange={e => setEditor(prev => (prev ? { ...prev, title: e.target.value } : prev))}
                />
              </div>
              <div>
                <Label htmlFor="category-name-ar">Arabic title (optional)</Label>
                <Input
                  id="category-name-ar"
                  dir="rtl"
                  maxLength={100}
                  placeholder="الاسم بالعربية"
                  value={editor?.titleAr || ''}
                  onChange={e => setEditor(prev => (prev ? { ...prev, titleAr: e.target.value } : prev))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="category-group">Guest Filter Tab Assignment</Label>
              <select
                id="category-group"
                className="manager-select w-full h-11 mt-1"
                value={editor?.menuGroup || 'auto'}
                onChange={e =>
                  setEditor(prev =>
                    prev ? { ...prev, menuGroup: e.target.value as CategoryMenuGroupSetting } : prev,
                  )
                }
              >
                {CATEGORY_MENU_GROUPS.map(g => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cat-from" className="text-xs">Available From (optional)</Label>
                <Input
                  id="cat-from"
                  type="time"
                  value={editor?.availableFrom || ''}
                  onChange={e => setEditor(prev => (prev ? { ...prev, availableFrom: e.target.value } : prev))}
                />
              </div>
              <div>
                <Label htmlFor="cat-until" className="text-xs">Available Until (optional)</Label>
                <Input
                  id="cat-until"
                  type="time"
                  value={editor?.availableUntil || ''}
                  onChange={e => setEditor(prev => (prev ? { ...prev, availableUntil: e.target.value } : prev))}
                />
              </div>
            </div>

            <label className="flex items-center justify-between rounded-xl border p-3 text-sm cursor-pointer">
              <span>Visible on guest menu</span>
              <Switch
                checked={editor?.isVisible ?? true}
                onCheckedChange={checked => setEditor(prev => (prev ? { ...prev, isVisible: checked } : prev))}
              />
            </label>

            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save category'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleting?.title}?</DialogTitle>
            <DialogDescription>
              This permanently removes this category and its {deleting ? count(deleting.id) : 0} menu items, including all price options.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              {remove.isPending ? 'Removing…' : 'Remove category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
