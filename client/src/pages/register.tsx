import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePlatformConfig } from "@/lib/usePlatformConfig";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const platformCfg = usePlatformConfig();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [maxBranches, setMaxBranches] = useState(platformCfg.defaultNewTenantMaxBranches);
  const [touchedQuota, setTouchedQuota] = useState(false);

  useEffect(() => {
    if (!touchedQuota) {
      setMaxBranches(platformCfg.defaultNewTenantMaxBranches);
    }
  }, [platformCfg.defaultNewTenantMaxBranches, touchedQuota]);

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      await apiRequest("POST", "/api/super-admin/restaurants", {
        email,
        password,
        firstName,
        lastName,
        restaurantName,
        ...(tenantName.trim() ? { tenantName: tenantName.trim() } : {}),
        maxBranches: Math.max(1, Math.min(200, Number(maxBranches) || 1)),
      });
    },
    onSuccess: async () => {
      toast({
        title: "Tenant & Restaurant Ready",
        description: "The Tenant Admin can now sign in and provision Reception & Prep staff.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/super-admin/restaurants"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/super-admin/tenants"] }),
      ]);
      setLocation("/super-admin/accounts");
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create restaurant",
        description: error.message || "Failed to register restaurant",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate();
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <div className="w-full max-w-lg space-y-6">
        <Link href="/super-admin/accounts">
          <Button variant="ghost" size="sm" className="mb-4 cursor-pointer" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tenants &amp; Accounts
          </Button>
        </Link>

        <Card>
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-display">Onboard Tenant &amp; First Venue</CardTitle>
            <CardDescription>
              Provisions an isolated Tenant Organization, its Tenant Admin account, and its initial branch QR.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Tenant Admin First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    data-testid="input-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Tenant Admin Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    data-testid="input-lastname"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="restaurantName">First Branch / Venue Name</Label>
                  <Input
                    id="restaurantName"
                    type="text"
                    placeholder="e.g. Pearl Lounge West Bay"
                    value={restaurantName}
                    onChange={e => setRestaurantName(e.target.value)}
                    required
                    data-testid="input-restaurant-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBranches">Branch Quota</Label>
                  <Input
                    id="maxBranches"
                    type="number"
                    min={1}
                    max={200}
                    value={maxBranches}
                    onChange={e => {
                      setTouchedQuota(true);
                      setMaxBranches(Number(e.target.value) || 1);
                    }}
                    data-testid="input-max-branches"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenantName">Tenant Brand / Group Name (optional)</Label>
                <Input
                  id="tenantName"
                  type="text"
                  placeholder="Defaults to First Branch Name"
                  value={tenantName}
                  onChange={e => setTenantName(e.target.value)}
                  data-testid="input-tenant-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Tenant Admin Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@yourrestaurant.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 10 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={10}
                  maxLength={72}
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={10}
                  maxLength={72}
                  data-testid="input-confirm-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full min-h-11 bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer"
                disabled={registerMutation.isPending}
                data-testid="button-register"
              >
                {registerMutation.isPending ? "Creating..." : "Create Tenant & Venue"}
              </Button>

              <p className="text-sm text-muted-foreground">
                The Tenant Admin uses this email and password to sign in, manage branches up to their quota, and issue Reception &amp; Prep logins or 6-digit Station PINs.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
