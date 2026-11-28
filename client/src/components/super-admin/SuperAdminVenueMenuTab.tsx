import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Edit, FolderOpen, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Category, MenuItem } from '@shared/schema';

interface Props {
  restaurantId: string;
  currency: string;
  categories?: Category[];
  menuItems?: MenuItem[];
}

export function SuperAdminVenueMenuTab({ restaurantId, currency, categories, menuItems }: Props) {
  const { toast } = useToast();
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: Category }>({ open: false });
  const [categoryFormData, setCategoryFormData] = useState({ title: '', order: 0 });
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  const [menuItemDialog, setMenuItemDialog] = useState<{ open: boolean; item?: MenuItem }>({ open: false });
  const [menuItemFormData, setMenuItemFormData] = useState({
    name: '',
    description: '',
    price: '',
    discount: '0',
    categoryId: '',
    isAvailable: true,
  });
  const [deleteMenuItemId, setDeleteMenuItemId] = useState<string | null>(null);

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryFormData.title.trim()) throw new Error('Category title is required');
      await apiRequest('POST', `/api/super-admin/restaurants/${restaurantId}/categories`, categoryFormData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/categories/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      setCategoryDialog({ open: false });
      setCategoryFormData({ title: '', order: 0 });
      toast({ title: 'Category created' });
    },
    onError: (error: any) =>
      toast({ title: 'Could not create category', description: error.message, variant: 'destructive' }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!categoryFormData.title.trim() || !categoryDialog.category?.id) throw new Error('Category title is required');
      await apiRequest('PUT', `/api/super-admin/categories/${categoryDialog.category.id}`, categoryFormData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/categories/${restaurantId}`] });
      setCategoryDialog({ open: false });
      toast({ title: 'Category updated' });
    },
    onError: (error: any) =>
      toast({ title: 'Could not update category', description: error.message, variant: 'destructive' }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => apiRequest('DELETE', `/api/super-admin/categories/${categoryId}`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/categories/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/menu-items/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      setDeleteCategoryId(null);
      toast({ title: 'Category deleted' });
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async () => {
      if (!menuItemFormData.name.trim()) throw new Error('Item name is required');
      if (!menuItemFormData.price || parseFloat(menuItemFormData.price) <= 0) throw new Error('Valid price required');
      await apiRequest('POST', `/api/super-admin/restaurants/${restaurantId}/menu-items`, {
        ...menuItemFormData,
        price: parseFloat(menuItemFormData.price),
        discount: parseFloat(menuItemFormData.discount) || 0,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/menu-items/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      setMenuItemDialog({ open: false });
      toast({ title: 'Menu item created' });
    },
    onError: (error: any) =>
      toast({ title: 'Could not create item', description: error.message, variant: 'destructive' }),
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async () => {
      if (!menuItemDialog.item?.id) throw new Error('Item ID missing');
      await apiRequest('PUT', `/api/super-admin/menu-items/${menuItemDialog.item.id}`, {
        ...menuItemFormData,
        price: parseFloat(menuItemFormData.price),
        discount: parseFloat(menuItemFormData.discount) || 0,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/menu-items/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      setMenuItemDialog({ open: false });
      toast({ title: 'Menu item updated' });
    },
    onError: (error: any) =>
      toast({ title: 'Could not update item', description: error.message, variant: 'destructive' }),
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: string) => apiRequest('DELETE', `/api/super-admin/menu-items/${itemId}`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/menu-items/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      setDeleteMenuItemId(null);
      toast({ title: 'Menu item deleted' });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Categories ({categories?.length || 0})</CardTitle>
              <CardDescription>Organize menu items into sections</CardDescription>
            </div>
            <Button
              onClick={() => {
                setCategoryFormData({ title: '', order: (categories?.length || 0) + 1 });
                setCategoryDialog({ open: true });
              }}
              data-testid="button-add-category"
              className="min-h-11 rounded-xl cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {categories && categories.length > 0 ? (
              categories.map(category => (
                <div key={category.id} className="rounded-xl border p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span className="font-medium" data-testid={`text-category-${category.id}`}>
                      {category.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCategoryFormData({ title: category.title, order: category.order });
                        setCategoryDialog({ open: true, category });
                      }}
                      data-testid={`button-edit-category-${category.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteCategoryId(category.id)}
                      data-testid={`button-delete-category-${category.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                No categories yet. Add a category or import starter items from the Global Menu Library.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Menu Items ({menuItems?.length || 0})</CardTitle>
              <CardDescription>All dishes and drinks in this venue</CardDescription>
            </div>
            <Button
              onClick={() => {
                setMenuItemFormData({
                  name: '',
                  description: '',
                  price: '',
                  discount: '0',
                  categoryId: categories?.[0]?.id || '',
                  isAvailable: true,
                });
                setMenuItemDialog({ open: true });
              }}
              disabled={!categories || categories.length === 0}
              data-testid="button-add-menu-item"
              className="min-h-11 rounded-xl cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Menu Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {menuItems && menuItems.length > 0 ? (
              menuItems.map(item => (
                <div key={item.id} className="rounded-xl border p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UtensilsCrossed className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-item-name-${item.id}`}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono font-semibold">
                          {item.price} {currency}
                        </span>
                        <Badge variant={item.isAvailable ? 'default' : 'secondary'} className="text-xs">
                          {item.isAvailable ? 'Available' : 'Sold Out'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setMenuItemFormData({
                          name: item.name,
                          description: item.description || '',
                          price: item.price.toString(),
                          discount: item.discount?.toString() || '0',
                          categoryId: item.categoryId || '',
                          isAvailable: item.isAvailable,
                        });
                        setMenuItemDialog({ open: true, item });
                      }}
                      data-testid={`button-edit-item-${item.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteMenuItemId(item.id)}
                      data-testid={`button-delete-item-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                {categories && categories.length > 0
                  ? 'No menu items yet.'
                  : 'Create at least one category before adding menu items.'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={categoryDialog.open} onOpenChange={open => setCategoryDialog({ open })}>
        <DialogContent data-testid="dialog-category">
          <DialogHeader>
            <DialogTitle>{categoryDialog.category ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>Group related dishes and drinks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="categoryTitle">Category Title</Label>
              <Input
                id="categoryTitle"
                value={categoryFormData.title}
                onChange={e => setCategoryFormData({ ...categoryFormData, title: e.target.value })}
                placeholder="e.g. Specialty Coffee"
                data-testid="input-category-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryOrder">Display Order</Label>
              <Input
                id="categoryOrder"
                type="number"
                value={categoryFormData.order}
                onChange={e => setCategoryFormData({ ...categoryFormData, order: parseInt(e.target.value) || 0 })}
                data-testid="input-category-order"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog({ open: false })} data-testid="button-cancel-category">
              Cancel
            </Button>
            <Button
              onClick={() => (categoryDialog.category ? updateCategoryMutation.mutate() : createCategoryMutation.mutate())}
              disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending || !categoryFormData.title}
              data-testid="button-save-category"
            >
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={menuItemDialog.open} onOpenChange={open => setMenuItemDialog({ open })}>
        <DialogContent data-testid="dialog-menu-item">
          <DialogHeader>
            <DialogTitle>{menuItemDialog.item ? 'Edit Menu Item' : 'Add Menu Item'}</DialogTitle>
            <DialogDescription>Configure price and availability in {currency}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item Name</Label>
              <Input
                id="itemName"
                value={menuItemFormData.name}
                onChange={e => setMenuItemFormData({ ...menuItemFormData, name: e.target.value })}
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemDescription">Description (Optional)</Label>
              <Textarea
                id="itemDescription"
                value={menuItemFormData.description}
                onChange={e => setMenuItemFormData({ ...menuItemFormData, description: e.target.value })}
                data-testid="input-item-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="itemPrice">Price ({currency})</Label>
                <Input
                  id="itemPrice"
                  type="number"
                  step="0.01"
                  value={menuItemFormData.price}
                  onChange={e => setMenuItemFormData({ ...menuItemFormData, price: e.target.value })}
                  data-testid="input-item-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="itemDiscount">Discount (%)</Label>
                <Input
                  id="itemDiscount"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={menuItemFormData.discount}
                  onChange={e => setMenuItemFormData({ ...menuItemFormData, discount: e.target.value })}
                  data-testid="input-item-discount"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCategory">Category</Label>
              <Select
                value={menuItemFormData.categoryId}
                onValueChange={value => setMenuItemFormData({ ...menuItemFormData, categoryId: value })}
              >
                <SelectTrigger id="itemCategory" data-testid="select-item-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="itemAvailable"
                checked={menuItemFormData.isAvailable}
                onCheckedChange={checked => setMenuItemFormData({ ...menuItemFormData, isAvailable: checked })}
                data-testid="switch-item-available"
              />
              <Label htmlFor="itemAvailable">Available for guests</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMenuItemDialog({ open: false })} data-testid="button-cancel-menu-item">
              Cancel
            </Button>
            <Button
              onClick={() => (menuItemDialog.item ? updateMenuItemMutation.mutate() : createMenuItemMutation.mutate())}
              disabled={
                createMenuItemMutation.isPending ||
                updateMenuItemMutation.isPending ||
                !menuItemFormData.name ||
                !menuItemFormData.price
              }
              data-testid="button-save-menu-item"
            >
              Save Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCategoryId} onOpenChange={open => !open && setDeleteCategoryId(null)}>
        <AlertDialogContent data-testid="dialog-delete-category">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the category and all menu items inside it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-category">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCategoryId && deleteCategoryMutation.mutate(deleteCategoryId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-category"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteMenuItemId} onOpenChange={open => !open && setDeleteMenuItemId(null)}>
        <AlertDialogContent data-testid="dialog-delete-menu-item">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Menu Item?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the menu item.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-item">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMenuItemId && deleteMenuItemMutation.mutate(deleteMenuItemId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-item"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
