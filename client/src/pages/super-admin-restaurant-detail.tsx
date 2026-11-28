import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Monitor,
  PauseCircle,
  QrCode,
  Save,
  ShieldAlert,
  Upload,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { ObjectUploader } from '@/components/ObjectUploader';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import PermanentMenuQR from '@/components/permanent-menu-qr';
import { SuperAdminLifecycleTab } from '@/components/super-admin/SuperAdminLifecycleTab';
import { SuperAdminVenueMenuTab } from '@/components/super-admin/SuperAdminVenueMenuTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { publicExperienceOrigin } from '@shared/menuIdentity';
import type { Category, MenuItem, Restaurant, User } from '@shared/schema';

interface RestaurantWithOwner extends Restaurant {
  owner: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
}

export default function SuperAdminRestaurantDetail() {
  const { toast } = useToast();
  const [, params] = useRoute('/super-admin/restaurant/:id');
  const [, navigate] = useLocation();
  const restaurantId = params?.id;

  const initialTab = (() => {
    if (typeof window === 'undefined') return 'lifecycle';
    const t = new URLSearchParams(window.location.search).get('tab');
    return t && ['lifecycle', 'profile', 'menu', 'qr', 'access'].includes(t) ? t : 'lifecycle';
  })();

  const { data: restaurant, isLoading } = useQuery<RestaurantWithOwner>({
    queryKey: [`/api/super-admin/restaurants/${restaurantId}`],
    enabled: !!restaurantId,
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: [`/api/super-admin/categories/${restaurantId}`],
    enabled: !!restaurantId,
  });

  const { data: menuItems } = useQuery<MenuItem[]>({
    queryKey: [`/api/super-admin/menu-items/${restaurantId}`],
    enabled: !!restaurantId,
  });

  const [profileData, setProfileData] = useState({
    name: '',
    cuisineType: '',
    address: '',
    phone: '',
    openingHours: '',
  });
  const [isHidden, setIsHidden] = useState(false);
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [coverMediaUrl, setCoverMediaUrl] = useState('');
  const [coverMediaType, setCoverMediaType] = useState<'image' | 'video' | 'gif' | null>(null);

  useEffect(() => {
    if (restaurant) {
      setProfileData({
        name: restaurant.name || '',
        cuisineType: restaurant.cuisineType || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        openingHours: restaurant.openingHours || '',
      });
      setIsHidden(!!restaurant.hidden);
      setCoverMediaUrl(restaurant.coverMediaUrl || '');
      setCoverMediaType(restaurant.coverMediaType as 'image' | 'video' | 'gif' | null);
    }
  }, [restaurant]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!profileData.name.trim()) throw new Error('Venue name is required');
      await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/profile`, profileData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}/lifecycle`] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      toast({ title: 'Venue profile updated' });
    },
    onError: (error: any) =>
      toast({
        title: 'Could not update profile',
        description: error.message || 'Check fields and try again',
        variant: 'destructive',
      }),
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (hidden: boolean) => {
      await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/visibility`, { hidden });
    },
    onSuccess: (_, hidden) => {
      setIsHidden(hidden);
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}`] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      toast({ title: hidden ? 'Venue hidden from public directory' : 'Venue visible to guests' });
    },
    onError: () =>
      toast({ title: 'Could not update visibility', variant: 'destructive' }),
  });

  const handleCoverMediaUpload = async () => {
    const response = await apiRequest('POST', `/api/super-admin/restaurants/${restaurantId}/upload`);
    const data = await response.json();
    return { method: 'PUT' as const, url: data.uploadURL };
  };

  const handleCoverMediaComplete = async (result: { successful: { uploadURL: string; type: string }[] }) => {
    const file = result.successful[0];
    if (!file?.uploadURL) throw new Error('Upload did not return a file');
    const mediaType = file.type === 'image/gif' ? 'gif' : file.type === 'video/mp4' ? 'video' : 'image';
    const response = await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/cover-media`, {
      coverMediaUrl: file.uploadURL,
      coverMediaType: mediaType,
    });
    const data = await response.json();
    setCoverMediaUrl(data.objectPath);
    setCoverMediaType(mediaType);
    await queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}`] });
    await queryClient.invalidateQueries({ queryKey: ['/api/manager-menu'] });
  };

  const handleRemoveCoverMedia = async () => {
    try {
      await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/cover-media`, {
        coverMediaUrl: '',
        coverMediaType: 'image',
      });
      setCoverMediaUrl('');
      setCoverMediaType(null);
      void queryClient.invalidateQueries({ queryKey: [`/api/super-admin/restaurants/${restaurantId}`] });
      toast({ title: 'Cover media removed' });
    } catch {
      toast({ title: 'Could not remove cover media', variant: 'destructive' });
    }
  };

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/password`, {
        newPassword: passwordData.newPassword,
      });
    },
    onSuccess: () => {
      toast({ title: 'Owner password reset', description: 'Active sessions for this owner were refreshed.' });
      setPasswordData({ newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) =>
      toast({ title: 'Could not reset password', description: error.message, variant: 'destructive' }),
  });

  if (isLoading || !restaurant) {
    return (
      <div className="flex items-center justify-center h-full p-8" role="status">
        <p className="text-muted-foreground">Loading venue controls…</p>
      </div>
    );
  }

  const publicOrigin = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  const slugOrId = restaurant.slug || restaurant.id;
  const liveMenuUrl = `${publicOrigin}/v/${slugOrId}`;
  const clearScreenUrl = `${publicOrigin}/screen/${slugOrId}`;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Venue Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/super-admin')}
            data-testid="button-back"
            aria-label="Back to venues"
            className="min-h-11 min-w-11 rounded-xl cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="heading-restaurant-name">
                {restaurant.name}
              </h1>
              {restaurant.status === 'suspended' ? (
                <Badge variant="destructive" className="gap-1">
                  <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Paused</span>
                </Badge>
              ) : (
                <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Live</span>
                </Badge>
              )}
              {isHidden ? (
                <Badge variant="secondary" className="gap-1">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  <span>Hidden</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Eye className="h-3 w-3" aria-hidden="true" />
                  <span>Public</span>
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono">/v/{slugOrId}</span>
              {restaurant.owner?.email && <span>· Owner: {restaurant.owner.email}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OpenCafeAccount id={restaurant.id} name={restaurant.name} />
          <Button asChild variant="outline" size="sm" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
            <a href={liveMenuUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4" />
              <span>Guest Menu</span>
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
            <a href={clearScreenUrl} target="_blank" rel="noreferrer">
              <Monitor className="w-4 h-4" />
              <span>Counter Screen</span>
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue={initialTab} className="w-full space-y-5">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 rounded-2xl">
          <TabsTrigger value="lifecycle" data-testid="tab-lifecycle" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            <span>Onboarding &amp; Offboarding</span>
          </TabsTrigger>
          <TabsTrigger value="profile" data-testid="tab-profile" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <Building2 className="h-4 w-4" />
            <span>Profile &amp; Cover</span>
          </TabsTrigger>
          <TabsTrigger value="menu" data-testid="tab-menu" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <UtensilsCrossed className="h-4 w-4" />
            <span>Menu &amp; Categories</span>
          </TabsTrigger>
          <TabsTrigger value="qr" data-testid="tab-qr" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <QrCode className="h-4 w-4" />
            <span>Menu QR</span>
          </TabsTrigger>
          <TabsTrigger value="access" data-testid="tab-access" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <Key className="h-4 w-4" />
            <span>Owner Access</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lifecycle">
          <SuperAdminLifecycleTab restaurant={restaurant} />
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Venue Profile &amp; Public Visibility</CardTitle>
              <CardDescription>Edit venue details, contact info, and public menu visibility.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Venue Name</Label>
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                    data-testid="input-restaurant-name"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuisineType">Cuisine / Concept</Label>
                  <Input
                    id="cuisineType"
                    value={profileData.cuisineType}
                    onChange={e => setProfileData({ ...profileData, cuisineType: e.target.value })}
                    placeholder="e.g. Specialty Coffee & Roastery"
                    data-testid="input-cuisine-type"
                    className="min-h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={profileData.address}
                  onChange={e => setProfileData({ ...profileData, address: e.target.value })}
                  rows={2}
                  data-testid="input-address"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profileData.phone}
                    onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+974 4400 0000"
                    data-testid="input-phone"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openingHours">Opening Hours</Label>
                  <Input
                    id="openingHours"
                    value={profileData.openingHours}
                    onChange={e => setProfileData({ ...profileData, openingHours: e.target.value })}
                    placeholder="Daily · 08:00 AM – 11:00 PM"
                    data-testid="input-opening-hours"
                    className="min-h-11"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-xl">
                <div className="space-y-0.5">
                  <Label htmlFor="visibility">Hide from Public Directory</Label>
                  <p className="text-xs text-muted-foreground">
                    Temporarily hides this venue’s public digital menu without freezing staff accounts.
                  </p>
                </div>
                <Switch
                  id="visibility"
                  checked={isHidden}
                  onCheckedChange={checked => toggleVisibilityMutation.mutate(checked)}
                  disabled={toggleVisibilityMutation.isPending}
                  data-testid="switch-visibility"
                />
              </div>

              <Button
                onClick={() => updateProfileMutation.mutate()}
                disabled={updateProfileMutation.isPending || !profileData.name.trim()}
                data-testid="button-save-profile"
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                <Save className="h-4 w-4" />
                <span>{updateProfileMutation.isPending ? 'Saving…' : 'Save Profile'}</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Menu Cover Media</CardTitle>
              <CardDescription>Hero image, GIF, or MP4 loop displayed at the top of the digital menu (max 5 MB).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {coverMediaUrl ? (
                <div className="relative rounded-xl overflow-hidden border">
                  {coverMediaType === 'video' ? (
                    <video src={coverMediaUrl} className="w-full h-64 object-cover" controls autoPlay muted loop />
                  ) : (
                    <img src={coverMediaUrl} alt={`${restaurant.name} cover`} className="w-full h-64 object-cover" />
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 cursor-pointer"
                    onClick={handleRemoveCoverMedia}
                    aria-label="Remove cover media"
                    data-testid="button-remove-cover"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-xl p-8 text-center">
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a cover photo, GIF, or MP4 video for the guest menu header.
                  </p>
                  <ObjectUploader
                    maxFileSize={5242880}
                    accept="image/png,image/jpeg,image/gif,image/webp,video/mp4"
                    onGetUploadParameters={handleCoverMediaUpload}
                    onComplete={handleCoverMediaComplete}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Cover Media
                  </ObjectUploader>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="menu">
          <SuperAdminVenueMenuTab
            restaurantId={restaurant.id}
            currency={restaurant.currency || 'QAR'}
            categories={categories}
            menuItems={menuItems}
          />
        </TabsContent>

        <TabsContent value="qr">
          <PermanentMenuQR key={restaurant.id} restaurant={restaurant} />
        </TabsContent>

        <TabsContent value="access">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Primary Owner Account &amp; Password Reset</CardTitle>
              <CardDescription>
                View the assigned owner login or issue a fresh password. For multi-branch roles and Station PINs, open{' '}
                <Link href="/super-admin/accounts" className="text-[#4B1FE0] font-semibold underline">
                  Accounts &amp; Roles
                </Link>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted/50 rounded-xl space-y-1 text-sm">
                <p className="font-semibold">Assigned Owner</p>
                <p>Email: {restaurant.owner?.email || 'No owner assigned'}</p>
                {restaurant.owner?.firstName && (
                  <p>
                    Name: {restaurant.owner.firstName} {restaurant.owner.lastName}
                  </p>
                )}
              </div>

              <div className="space-y-4 pt-4 border-t max-w-md">
                <h3 className="font-semibold text-sm">Reset Owner Password</h3>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password (10+ characters)</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    minLength={10}
                    onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="At least 10 characters"
                    data-testid="input-new-password"
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    data-testid="input-confirm-password"
                    className="min-h-11"
                  />
                </div>
                <Button
                  onClick={() => updatePasswordMutation.mutate()}
                  disabled={
                    updatePasswordMutation.isPending ||
                    passwordData.newPassword.length < 10 ||
                    passwordData.newPassword !== passwordData.confirmPassword
                  }
                  variant="destructive"
                  data-testid="button-reset-password"
                  className="min-h-11 rounded-xl cursor-pointer gap-2"
                >
                  <Key className="h-4 w-4" />
                  <span>{updatePasswordMutation.isPending ? 'Updating…' : 'Reset Owner Password'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
