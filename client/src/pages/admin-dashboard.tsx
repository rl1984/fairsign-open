import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  FileCode,
  Send,
  Loader2,
  Copy,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  LogOut,
  Plus,
  RefreshCw,
  Eye,
  Upload,
  Users,
  Settings,
  Archive,
  ArchiveRestore,
  Download,
  FileCheck,
  Search,
  Percent,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import UserManagement from "@/components/user-management";
import TwoFactorSetup from "@/components/two-factor-setup";
import { StorageSettings } from "@/components/storage-settings";
import { TemplatesManagement } from "@/components/templates-management";
import { ProfileSettings } from "@/components/profile-settings";
import { GuidesManagement } from "@/components/guides-management";
import { SubscriptionManagement } from "@/components/subscription-management";
import { IdentityVerification } from "@/components/identity-verification";
import { HardDrive, CreditCard, Crown, Zap, Sparkles, TrendingUp, DollarSign, Receipt, ShieldCheck, BookOpen } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Document, AuditEvent, SignatureAsset } from "@shared/schema";

// Admin analytics types
interface AdminStats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  totalDocuments: number;
  userGrowth: { date: string; count: number }[];
  documentGrowth: { date: string; count: number }[];
  monthlyRevenue: number;
  arr: number;
}

interface AdminSettingsData {
  id: string | null;
  displayCurrency: string;
  companyName: string | null;
  companyAddress: string | null;
  companyVatId: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyLogoKey: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${symbol}${amount.toLocaleString()}`;
}

// Admin StatCard component
function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon 
}: { 
  title: string; 
  value: string | number; 
  description?: string; 
  icon: any 
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Admin GrowthChart component
function GrowthChart({ 
  data, 
  title, 
  dataKey = "count",
  color = "hsl(var(--primary))"
}: { 
  data: { date: string; count: number }[]; 
  title: string;
  dataKey?: string;
  color?: string;
}) {
  const chartData = data.map(d => ({
    ...d,
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                fontSize={12} 
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                fontSize={12} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Area 
                type="monotone" 
                dataKey={dataKey} 
                stroke={color}
                fill={color}
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Invoice Settings Component for Admin Dashboard
function InvoiceSettings({ 
  settings, 
  onSave,
  isSaving
}: { 
  settings: AdminSettingsData | undefined;
  onSave: (data: Partial<{
    companyName: string;
    companyAddress: string;
    companyVatId: string;
    companyEmail: string;
    companyPhone: string;
  }>) => void;
  isSaving: boolean;
}) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState(settings?.companyName || "");
  const [companyAddress, setCompanyAddress] = useState(settings?.companyAddress || "");
  const [companyVatId, setCompanyVatId] = useState(settings?.companyVatId || "");
  const [companyEmail, setCompanyEmail] = useState(settings?.companyEmail || "");
  const [companyPhone, setCompanyPhone] = useState(settings?.companyPhone || "");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    setCompanyName(settings?.companyName || "");
    setCompanyAddress(settings?.companyAddress || "");
    setCompanyVatId(settings?.companyVatId || "");
    setCompanyEmail(settings?.companyEmail || "");
    setCompanyPhone(settings?.companyPhone || "");
  }, [settings]);

  useEffect(() => {
    if (settings?.companyLogoKey) {
      fetch("/api/ee/admin/settings/logo")
        .then(res => res.json())
        .then(data => {
          if (data.url) setLogoUrl(data.url);
        })
        .catch(() => {});
    }
  }, [settings?.companyLogoKey]);

  const handleSave = () => {
    onSave({
      companyName,
      companyAddress,
      companyVatId,
      companyEmail,
      companyPhone,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Logo must be under 2MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const res = await fetch("/api/ee/admin/settings/logo", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Upload failed");
      
      const data = await res.json();
      toast({
        title: "Logo uploaded",
        description: "Company logo has been updated.",
      });
      
      // Refresh logo URL
      const logoRes = await fetch("/api/ee/admin/settings/logo");
      const logoData = await logoRes.json();
      if (logoData.url) setLogoUrl(logoData.url);
      
      queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/settings"] });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Could not upload company logo.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    try {
      const res = await fetch("/api/ee/admin/settings/logo", {
        method: "DELETE",
      });
      
      if (!res.ok) throw new Error("Delete failed");
      
      setLogoUrl(null);
      toast({
        title: "Logo removed",
        description: "Company logo has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/settings"] });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Could not delete company logo.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Invoice Settings
        </CardTitle>
        <CardDescription>
          Configure your company details for professional invoices. These details appear on all invoices sent to customers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-logo">Company Logo</Label>
            <p className="text-sm text-muted-foreground">
              Upload your company logo (max 2MB, PNG, JPG, or SVG)
            </p>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="relative">
                  <img 
                    src={logoUrl} 
                    alt="Company Logo" 
                    className="h-16 w-auto max-w-32 object-contain border rounded-md"
                    data-testid="img-company-logo"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={handleDeleteLogo}
                    data-testid="button-delete-logo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="h-16 w-32 border-2 border-dashed rounded-md flex items-center justify-center text-muted-foreground text-sm">
                  No logo
                </div>
              )}
              <div>
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  data-testid="input-logo-upload"
                />
                <label htmlFor="logo-upload">
                  <Button 
                    variant="outline" 
                    disabled={isUploadingLogo}
                    asChild
                  >
                    <span className="cursor-pointer">
                      {isUploadingLogo ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Logo
                        </>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Inc."
                data-testid="input-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-vat">VAT/Tax ID</Label>
              <Input
                id="company-vat"
                value={companyVatId}
                onChange={(e) => setCompanyVatId(e.target.value)}
                placeholder="VAT12345678"
                data-testid="input-company-vat"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company-address">Company Address</Label>
            <textarea
              id="company-address"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="123 Business Street&#10;City, State 12345&#10;Country"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="textarea-company-address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company-email">Contact Email</Label>
              <Input
                id="company-email"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="billing@company.com"
                data-testid="input-company-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-phone">Contact Phone</Label>
              <Input
                id="company-phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                data-testid="input-company-phone"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-invoice-settings">
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Invoice Settings"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type TimeRange = "7d" | "30d" | "90d" | "1y" | "all";
type ChartMode = "daily" | "cumulative";

function UserGrowthChart({ 
  color = "hsl(var(--primary))"
}: { 
  color?: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");

  const { data: growthData, isLoading } = useQuery<{ date: string; count: number }[]>({
    queryKey: ['/api/ee/admin/user-growth', { timeRange }],
    queryFn: () => fetch(`/api/ee/admin/user-growth?timeRange=${timeRange}`).then(res => res.json()),
  });

  const chartData = (growthData || []).map((d, index, arr) => {
    const formattedDate = new Date(d.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: timeRange === "1y" || timeRange === "all" ? '2-digit' : undefined
    });
    
    if (chartMode === "cumulative") {
      const cumulativeCount = arr.slice(0, index + 1).reduce((sum, item) => sum + item.count, 0);
      return { date: formattedDate, count: cumulativeCount };
    }
    return { date: formattedDate, count: d.count };
  });

  const timeRangeLabels: Record<TimeRange, string> = {
    "7d": "7 Days",
    "30d": "30 Days", 
    "90d": "90 Days",
    "1y": "1 Year",
    "all": "All Time",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">User Growth</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={timeRange} onValueChange={(val) => setTimeRange(val as TimeRange)}>
              <SelectTrigger className="w-[110px]" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chartMode} onValueChange={(val) => setChartMode(val as ChartMode)}>
              <SelectTrigger className="w-[120px]" data-testid="select-chart-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="cumulative">Cumulative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {chartMode === "cumulative" ? "Total users over time" : "New users per day"} ({timeRangeLabels[timeRange]})
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [value, chartMode === "cumulative" ? "Total Users" : "New Users"]}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentCompletionChart({ 
  color = "hsl(142 76% 36%)"
}: { 
  color?: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");

  const { data: completionData, isLoading } = useQuery<{ date: string; count: number }[]>({
    queryKey: ['/api/ee/admin/document-completion', { timeRange }],
    queryFn: () => fetch(`/api/ee/admin/document-completion?timeRange=${timeRange}`).then(res => res.json()),
  });

  const chartData = (completionData || []).map((d, index, arr) => {
    const formattedDate = new Date(d.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: timeRange === "1y" || timeRange === "all" ? '2-digit' : undefined
    });
    
    if (chartMode === "cumulative") {
      const cumulativeCount = arr.slice(0, index + 1).reduce((sum, item) => sum + item.count, 0);
      return { date: formattedDate, count: cumulativeCount };
    }
    return { date: formattedDate, count: d.count };
  });

  const timeRangeLabels: Record<TimeRange, string> = {
    "7d": "7 Days",
    "30d": "30 Days", 
    "90d": "90 Days",
    "1y": "1 Year",
    "all": "All Time",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Documents Signed</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={timeRange} onValueChange={(val) => setTimeRange(val as TimeRange)}>
              <SelectTrigger className="w-[110px]" data-testid="select-doc-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chartMode} onValueChange={(val) => setChartMode(val as ChartMode)}>
              <SelectTrigger className="w-[120px]" data-testid="select-doc-chart-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="cumulative">Cumulative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {chartMode === "cumulative" ? "Total documents signed" : "Documents signed per day"} ({timeRangeLabels[timeRange]})
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [value, chartMode === "cumulative" ? "Total Signed" : "Signed"]}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ApiUsageData {
  daily: { date: string; count: number; cumulative: number }[];
  total: number;
  byEndpoint: { endpoint: string; count: number }[];
}

function ApiUsageChart({ 
  color = "hsl(220 70% 50%)"
}: { 
  color?: string;
}) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [chartMode, setChartMode] = useState<ChartMode>("daily");

  const { data: usageData, isLoading } = useQuery<ApiUsageData>({
    queryKey: ['/api/ee/admin/api-usage', { timeRange }],
    queryFn: () => fetch(`/api/ee/admin/api-usage?timeRange=${timeRange}`).then(res => res.json()),
  });

  const chartData = (usageData?.daily || []).map((d) => {
    const formattedDate = new Date(d.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: timeRange === "1y" || timeRange === "all" ? '2-digit' : undefined
    });
    
    return { 
      date: formattedDate, 
      count: chartMode === "cumulative" ? d.cumulative : d.count 
    };
  });

  const timeRangeLabels: Record<TimeRange, string> = {
    "7d": "7 Days",
    "30d": "30 Days", 
    "90d": "90 Days",
    "1y": "1 Year",
    "all": "All Time",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">API Usage</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={timeRange} onValueChange={(val) => setTimeRange(val as TimeRange)}>
              <SelectTrigger className="w-[110px]" data-testid="select-api-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chartMode} onValueChange={(val) => setChartMode(val as ChartMode)}>
              <SelectTrigger className="w-[120px]" data-testid="select-api-chart-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="cumulative">Cumulative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {chartMode === "cumulative" ? "Total API calls over time" : "API calls per day"} ({timeRangeLabels[timeRange]})
          {usageData && <span className="ml-2 font-medium">Total: {usageData.total.toLocaleString()}</span>}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No API calls recorded yet
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [value, chartMode === "cumulative" ? "Total Calls" : "API Calls"]}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DocumentWithDetails extends Document {
  signatureAssets?: SignatureAsset[];
  auditEvents?: AuditEvent[];
}

interface CreateDocumentResponse {
  document_id: string;
  signing_url: string;
  status: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
    case "sent":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Sent</Badge>;
    case "created":
      return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Created</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PromoCampaign {
  id: string;
  code: string;
  description: string | null;
  percentOff: number;
  maxRedemptions: number | null;
  currentRedemptions: number;
  expiresAt: string | null;
  isActive: boolean;
  stripeCouponId: string | null;
  stripePromoCodeId: string | null;
  createdAt: string;
  stripeRedemptions?: number;
  stripeActive?: boolean;
}

function PromoCodesManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPercentOff, setNewPercentOff] = useState("10");
  const [newMaxRedemptions, setNewMaxRedemptions] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  const { data: promoCodes, isLoading, refetch } = useQuery<PromoCampaign[]>({
    queryKey: ["/api/ee/admin/promo-codes"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      description: string;
      percentOff: number;
      maxRedemptions?: number;
      expiresAt?: string;
    }) => {
      return apiRequest("POST", "/api/ee/admin/promo-codes", data);
    },
    onSuccess: async () => {
      toast({ title: "Promo code created successfully" });
      setIsCreateDialogOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/promo-codes"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create promo code",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/ee/admin/promo-codes/${id}`, { isActive });
    },
    onSuccess: async () => {
      toast({ title: "Promo code updated" });
      await queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/promo-codes"] });
    },
    onError: () => {
      toast({ title: "Failed to update promo code", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/ee/admin/promo-codes/${id}`);
    },
    onSuccess: async () => {
      toast({ title: "Promo code deleted" });
      await queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/promo-codes"] });
    },
    onError: () => {
      toast({ title: "Failed to delete promo code", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewCode("");
    setNewDescription("");
    setNewPercentOff("10");
    setNewMaxRedemptions("");
    setNewExpiresAt("");
  };

  const handleCreate = () => {
    if (!newCode || newCode.length < 3) {
      toast({ title: "Code must be at least 3 characters", variant: "destructive" });
      return;
    }
    const percentOff = parseInt(newPercentOff);
    if (isNaN(percentOff) || percentOff < 1 || percentOff > 100) {
      toast({ title: "Percent off must be between 1 and 100", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      code: newCode.toUpperCase(),
      description: newDescription,
      percentOff,
      maxRedemptions: newMaxRedemptions ? parseInt(newMaxRedemptions) : undefined,
      expiresAt: newExpiresAt || undefined,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
        <div>
          <CardTitle>Promo Codes</CardTitle>
          <CardDescription>Create and manage discount codes for subscriptions</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-promos">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-promo">
            <Plus className="h-4 w-4 mr-2" />
            New Promo Code
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !promoCodes || promoCodes.length === 0 ? (
          <div className="text-center py-8">
            <Percent className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No promo codes yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first promo code to offer discounts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promoCodes.map((promo) => (
              <div
                key={promo.id}
                className="flex items-center justify-between p-4 border rounded-md"
                data-testid={`promo-row-${promo.id}`}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-lg" data-testid={`promo-code-${promo.id}`}>
                        {promo.code}
                      </span>
                      <Badge variant={promo.isActive ? "default" : "secondary"}>
                        {promo.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">{promo.percentOff}% off</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {promo.description && <span>{promo.description} | </span>}
                      <span>
                        {promo.stripeRedemptions ?? promo.currentRedemptions} redemptions
                        {promo.maxRedemptions && ` / ${promo.maxRedemptions} max`}
                      </span>
                      {promo.expiresAt && (
                        <span> | Expires: {new Date(promo.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive })}
                    disabled={toggleMutation.isPending}
                    data-testid={`button-toggle-promo-${promo.id}`}
                  >
                    {promo.isActive ? (
                      <ToggleRight className="h-5 w-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete promo code "${promo.code}"?`)) {
                        deleteMutation.mutate(promo.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-promo-${promo.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Promo Code</DialogTitle>
              <DialogDescription>
                Create a new discount code for subscriptions. The code will be synced with Stripe.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="promo-code">Code</Label>
                <Input
                  id="promo-code"
                  placeholder="SUMMER2025"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  data-testid="input-promo-code"
                />
                <p className="text-xs text-muted-foreground">Minimum 3 characters, will be uppercase</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-description">Description (optional)</Label>
                <Input
                  id="promo-description"
                  placeholder="Summer promotion discount"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  data-testid="input-promo-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-percent">Discount Percentage</Label>
                <Input
                  id="promo-percent"
                  type="number"
                  min="1"
                  max="100"
                  value={newPercentOff}
                  onChange={(e) => setNewPercentOff(e.target.value)}
                  data-testid="input-promo-percent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-max">Max Redemptions (optional)</Label>
                <Input
                  id="promo-max"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={newMaxRedemptions}
                  onChange={(e) => setNewMaxRedemptions(e.target.value)}
                  data-testid="input-promo-max"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-expires">Expiration Date (optional)</Label>
                <Input
                  id="promo-expires"
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  data-testid="input-promo-expires"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-promo">
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  // Tab state management - robust approach
  // Track user's explicit tab selection
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  // Track last known role to prevent flicker during auth refresh
  const [lastKnownRole, setLastKnownRole] = useState<boolean | null>(null);
  // Track if role has ever been initialized (prevents showing wrong tabs on initial load)
  const [roleInitialized, setRoleInitialized] = useState(false);
  
  // Update lastKnownRole when user data is available, reset tab selection on role change
  useEffect(() => {
    if (user) {
      if (lastKnownRole !== null && lastKnownRole !== user.isAdmin) {
        // Role changed - reset selection to force default for new role
        setSelectedTab(null);
      }
      setLastKnownRole(user.isAdmin);
      setRoleInitialized(true);
    }
  }, [user, lastKnownRole]);

  // Handle URL parameters for tab selection and verification completion
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const verificationParam = params.get("verification");
    
    if (tabParam) {
      setSelectedTab(tabParam);
    }
    
    if (verificationParam === "complete") {
      toast({
        title: "Verification Submitted",
        description: "Your identity verification is being processed. This usually takes a few minutes.",
      });
      // Remove query parameters from URL
      window.history.replaceState({}, "", "/dashboard" + (tabParam ? `?tab=${tabParam}` : ""));
      // Refresh identity status
      queryClient.invalidateQueries({ queryKey: ["/api/ee/identity/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ee/identity/eligibility"] });
    }
  }, [toast]);
  
  // Compute the resolved tab based on user role and selection
  const getDefaultTabForRole = (isAdmin: boolean) => isAdmin ? "overview" : "documents";
  
  // Use lastKnownRole as fallback during auth refresh to prevent flicker
  // Only use fallback after role has been initialized once
  const effectiveRole = user?.isAdmin ?? (roleInitialized ? lastKnownRole : null) ?? false;
  const resolvedTab = selectedTab ?? getDefaultTabForRole(effectiveRole);
  
  // Show loader until role is initialized for the first time
  // This prevents admins from ever seeing document tabs on initial load
  const showTabsLoader = !roleInitialized;
  
  // Update handler that tracks user selection
  const handleTabChange = (tab: string) => {
    setSelectedTab(tab);
  };
  
  const [selectedDocument, setSelectedDocument] = useState<DocumentWithDetails | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [documentFilter, setDocumentFilter] = useState<"active" | "completed" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state for new document
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [rent, setRent] = useState("");
  const [createdResult, setCreatedResult] = useState<CreateDocumentResponse | null>(null);

  // Email form state
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailRecipientName, setEmailRecipientName] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Fetch subscription status
  interface SubscriptionStatus {
    accountType: string;
    subscriptionStatus: string | null;
    documentsUsed: number;
    documentLimit: number;
    canCreateDocument: boolean;
  }
  
  const { data: subscription } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    enabled: isAuthenticated,
  });

  const isPro = subscription?.accountType === "pro" || subscription?.accountType === "enterprise";
  const isEnterprise = subscription?.accountType === "enterprise";

  // Admin-only queries for analytics and settings
  const { data: adminStats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/ee/admin/stats"],
    enabled: isAuthenticated && effectiveRole,
  });

  const { data: adminSettings } = useQuery<AdminSettingsData>({
    queryKey: ["/api/ee/admin/settings"],
    enabled: isAuthenticated && effectiveRole,
  });

  const displayCurrency = adminSettings?.displayCurrency || "EUR";

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<{
      displayCurrency: string;
      companyName: string;
      companyAddress: string;
      companyVatId: string;
      companyEmail: string;
      companyPhone: string;
    }>) => {
      return apiRequest("PATCH", "/api/ee/admin/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ee/admin/settings"] });
      toast({
        title: "Settings Updated",
        description: "Admin settings have been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch documents for the authenticated user
  const { data: documents, isLoading: docsLoading, refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents"],
    enabled: isAuthenticated,
  });

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/documents", data);
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: "Document created",
        description: "The signing link has been generated.",
      });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Archive document mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ docId, archive }: { docId: string; archive: boolean }) => {
      const endpoint = archive 
        ? `/api/admin/documents/${docId}/archive`
        : `/api/admin/documents/${docId}/unarchive`;
      const res = await apiRequest("POST", endpoint);
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({
        title: variables.archive ? "Document archived" : "Document restored",
        description: variables.archive 
          ? "The document has been moved to archives." 
          : "The document has been restored.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch document details
  const fetchDocumentDetails = async (docId: string) => {
    const res = await fetch(`/api/admin/documents/${docId}`, { credentials: "include" });
    if (!res.ok) {
      throw new Error("Failed to fetch document details");
    }
    return res.json();
  };

  const handleViewDocument = async (doc: Document) => {
    try {
      const details = await fetchDocumentDetails(doc.id);
      setSelectedDocument(details);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load document details",
        variant: "destructive",
      });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createDocumentMutation.mutate({
      template_id: "lease_v1",
      data: {
        tenant_name: tenantName,
        tenant_email: tenantEmail,
        property_address: propertyAddress,
        rent: rent,
        lease_start: new Date().toISOString().split("T")[0],
        lease_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        landlord_name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : "Property Management",
        landlord_email: user?.email || "landlord@example.com",
      },
      callback_url: `${window.location.origin}/api/webhook-test`,
    });
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Signing URL copied to clipboard." });
  };

  // Send email functions
  const handleSendEmail = async (documentId: string, emailType: "signature_request" | "reminder") => {
    if (!emailRecipient) {
      toast({ title: "Error", description: "Please enter a recipient email address.", variant: "destructive" });
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const endpoint = emailType === "signature_request" 
        ? `/api/admin/documents/${documentId}/send-email`
        : `/api/admin/documents/${documentId}/send-reminder`;
        
      const res = await apiRequest("POST", endpoint, {
        signerEmail: emailRecipient,
        signerName: emailRecipientName || undefined,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send email");
      }
      
      toast({ 
        title: "Email Sent", 
        description: emailType === "signature_request" 
          ? "Signature request email has been sent." 
          : "Reminder email has been sent." 
      });
      
      setEmailRecipient("");
      setEmailRecipientName("");
      refetchDocs();
      
      if (selectedDocument) {
        const details = await fetchDocumentDetails(selectedDocument.id);
        setSelectedDocument(details);
      }
    } catch (error: any) {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Please log in again.", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Failed to send email", variant: "destructive" });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const resetCreateDialog = () => {
    setTenantName("");
    setTenantEmail("");
    setPropertyAddress("");
    setRent("");
    setCreatedResult(null);
    setIsCreateDialogOpen(false);
  };

  // If not authenticated, redirect to login
  if (!authLoading && !isAuthenticated) {
    window.location.href = "/";
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FairSign" className="h-8 w-8" />
            <h1 className="text-lg font-semibold">FairSign</h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {user && (
              <div className="flex items-center gap-2">
                <UserAvatar user={user} />
                <span className="text-sm hidden sm:inline" data-testid="text-user-name">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await fetch("/api/logout", { method: "POST", credentials: "include" });
                window.location.href = "/";
              }}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Upgrade Banner for Free Users - hidden for admin accounts */}
        {!isPro && subscription && !effectiveRole && (
          <Card className="mb-6 border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Upgrade to Pro for Unlimited Documents</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      You have {Math.max(0, 5 - (subscription?.documentsUsed ?? 0))} of 5 free documents remaining this month. 
                      Upgrade for unlimited documents, bulk import, and more.
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => handleTabChange("subscription")}
                  className="shrink-0"
                  data-testid="button-upgrade-banner"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Upgrade Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showTabsLoader ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <Tabs value={resolvedTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <TabsList>
              {/* Document tabs - hidden for admin users who can't create documents */}
              {!effectiveRole && (
                <>
                  <TabsTrigger value="documents" data-testid="tab-documents">
                    <FileText className="h-4 w-4 mr-2" />
                    Documents
                  </TabsTrigger>
                  <TabsTrigger value="templates" data-testid="tab-templates">
                    <FileCode className="h-4 w-4 mr-2" />
                    Templates
                  </TabsTrigger>
                </>
              )}
              {/* Admin-only tabs */}
              {effectiveRole && (
                <TabsTrigger value="overview" data-testid="tab-overview">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Overview
                </TabsTrigger>
              )}
              {effectiveRole && (
                <TabsTrigger value="users" data-testid="tab-users">
                  <Users className="h-4 w-4 mr-2" />
                  Users
                </TabsTrigger>
              )}
              {effectiveRole && (
                <TabsTrigger value="promo-codes" data-testid="tab-promo-codes">
                  <Percent className="h-4 w-4 mr-2" />
                  Promo Codes
                </TabsTrigger>
              )}
              {effectiveRole && (
                <TabsTrigger value="storage" data-testid="tab-storage">
                  <HardDrive className="h-4 w-4 mr-2" />
                  Storage
                </TabsTrigger>
              )}
              {effectiveRole && (
                <TabsTrigger value="guides" data-testid="tab-guides">
                  <FileText className="h-4 w-4 mr-2" />
                  Guides
                </TabsTrigger>
              )}
              {effectiveRole && (
                <TabsTrigger value="admin-settings" data-testid="tab-admin-settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              )}
              {!effectiveRole && (
                <TabsTrigger value="subscription" data-testid="tab-subscription">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Account
                </TabsTrigger>
              )}
              {!effectiveRole && (
                <TabsTrigger value="settings" data-testid="tab-settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>

            {/* Action buttons - only show for non-admin users */}
            {!effectiveRole && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDocs()}
                  data-testid="button-refresh"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => setLocation("/documents/new")}
                  data-testid="button-new-document"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Document
                </Button>
                {isEnterprise && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLocation("/bulk-send")}
                    data-testid="button-bulk-send"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Send
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLocation("/guides")}
                  data-testid="button-help-guides"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Help
                </Button>
              </div>
            )}
          </div>

          {/* Documents tab - only render for non-admin users */}
          {!effectiveRole && (
            <TabsContent value="documents">
              {docsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !documents || documents.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No documents yet</p>
                    <Button onClick={() => setLocation("/documents/new")} data-testid="button-create-first">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Document
                    </Button>
                  </CardContent>
                </Card>
              ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by title, name, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-documents"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={documentFilter === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("active")}
                      data-testid="button-show-active"
                    >
                      Active
                    </Button>
                    <Button
                      variant={documentFilter === "completed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("completed")}
                      data-testid="button-show-completed"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Completed
                    </Button>
                    <Button
                      variant={documentFilter === "archived" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDocumentFilter("archived")}
                      data-testid="button-show-archived"
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      Archived
                    </Button>
                  </div>
                </div>
                {documents.filter((doc) => {
                  // Status filter
                  if (documentFilter === "archived" && !doc.archivedAt) return false;
                  if (documentFilter === "completed" && (doc.status !== "completed" || doc.archivedAt)) return false;
                  if (documentFilter === "active" && (doc.status === "completed" || doc.archivedAt)) return false;
                  // Search filter
                  if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase();
                    const dataJson = doc.dataJson as Record<string, unknown> | null;
                    const title = dataJson?.title ? String(dataJson.title).toLowerCase() : "";
                    const tenantName = dataJson?.tenant_name ? String(dataJson.tenant_name).toLowerCase() : "";
                    const signers = (dataJson?.signers as Array<{name: string; email: string}>) || [];
                    const signerNames = signers.map(s => s.name.toLowerCase()).join(" ");
                    const signerEmails = signers.map(s => s.email.toLowerCase()).join(" ");
                    const searchableText = `${title} ${tenantName} ${signerNames} ${signerEmails} ${doc.id.toLowerCase()}`;
                    if (!searchableText.includes(query)) return false;
                  }
                  return true;
                }).length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      {searchQuery.trim() ? (
                        <>
                          <Search className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No documents match "{searchQuery}"</p>
                        </>
                      ) : documentFilter === "archived" ? (
                        <>
                          <Archive className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No archived documents</p>
                        </>
                      ) : documentFilter === "completed" ? (
                        <>
                          <CheckCircle className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No completed documents</p>
                        </>
                      ) : (
                        <>
                          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                          <p className="text-muted-foreground mb-4">No active documents</p>
                          <Button onClick={() => setLocation("/documents/new")} data-testid="button-create-new">
                            <Plus className="h-4 w-4 mr-2" />
                            Create Document
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : documents
                  .filter((doc) => {
                    // Status filter
                    if (documentFilter === "archived" && !doc.archivedAt) return false;
                    if (documentFilter === "completed" && (doc.status !== "completed" || doc.archivedAt)) return false;
                    if (documentFilter === "active" && (doc.status === "completed" || doc.archivedAt)) return false;
                    // Search filter
                    if (searchQuery.trim()) {
                      const query = searchQuery.toLowerCase();
                      const dataJson = doc.dataJson as Record<string, unknown> | null;
                      const title = dataJson?.title ? String(dataJson.title).toLowerCase() : "";
                      const tenantName = dataJson?.tenant_name ? String(dataJson.tenant_name).toLowerCase() : "";
                      const signers = (dataJson?.signers as Array<{name: string; email: string}>) || [];
                      const signerNames = signers.map(s => s.name.toLowerCase()).join(" ");
                      const signerEmails = signers.map(s => s.email.toLowerCase()).join(" ");
                      const searchableText = `${title} ${tenantName} ${signerNames} ${signerEmails} ${doc.id.toLowerCase()}`;
                      if (!searchableText.includes(query)) return false;
                    }
                    return true;
                  })
                  .map((doc) => (
                  <Card key={doc.id} className="hover-elevate" data-testid={`card-document-${doc.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {getStatusBadge(doc.status)}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(doc.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate" data-testid={`text-doc-id-${doc.id}`}>
                            {doc.dataJson && typeof doc.dataJson === 'object' && (doc.dataJson as Record<string, unknown>).title
                              ? String((doc.dataJson as Record<string, unknown>).title)
                              : doc.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {doc.templateId 
                              ? `Template: ${doc.templateId}` 
                              : "One-off document"}
                          </p>
                          {doc.dataJson && typeof doc.dataJson === 'object' && (
                            <>
                              {(doc.dataJson as Record<string, unknown>).oneOffDocument ? (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {((doc.dataJson as Record<string, unknown>).signers as Array<{name: string; email: string}>)?.map(s => s.name).join(", ") || ""}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground mt-1">
                                  {String((doc.dataJson as Record<string, unknown>).tenant_name || "")} - {String((doc.dataJson as Record<string, unknown>).property_address || "")}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(doc)}
                            data-testid={`button-info-${doc.id}`}
                            title="View document information"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Info
                          </Button>
                          {doc.status === "created" && !doc.archivedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = `${window.location.origin}/d/${doc.id}?token=${doc.signingToken}`;
                                window.open(url, "_blank");
                              }}
                              data-testid={`button-open-${doc.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.status === "completed" && doc.signedPdfKey && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  window.open(`/api/admin/documents/${doc.id}/signed.pdf`, "_blank");
                                }}
                                data-testid={`button-view-signed-${doc.id}`}
                                title="View signed PDF"
                              >
                                <FileCheck className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const link = document.createElement("a");
                                  link.href = `/api/admin/documents/${doc.id}/signed.pdf?download=true`;
                                  link.download = `signed-${doc.id}.pdf`;
                                  link.click();
                                }}
                                data-testid={`button-download-${doc.id}`}
                                title="Download signed PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {doc.status !== "completed" && !doc.archivedAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveMutation.mutate({ docId: doc.id, archive: true })}
                              disabled={archiveMutation.isPending}
                              data-testid={`button-archive-${doc.id}`}
                              title="Archive document"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          {doc.archivedAt && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => archiveMutation.mutate({ docId: doc.id, archive: false })}
                              disabled={archiveMutation.isPending}
                              data-testid={`button-unarchive-${doc.id}`}
                              title="Restore document"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            </TabsContent>
          )}

          {/* Templates tab - only render for non-admin users */}
          {!effectiveRole && (
            <TabsContent value="templates">
              <TemplatesManagement />
            </TabsContent>
          )}

          {/* Overview tab - admin analytics dashboard */}
          {effectiveRole && (
            <TabsContent value="overview" className="space-y-6">
              {statsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard 
                      title="Total Users" 
                      value={adminStats?.totalUsers || 0}
                      icon={Users}
                      description={`${adminStats?.freeUsers || 0} free, ${adminStats?.proUsers || 0} pro`}
                    />
                    <StatCard 
                      title="Total Documents" 
                      value={adminStats?.totalDocuments || 0}
                      icon={FileText}
                    />
                    <StatCard 
                      title="Monthly Revenue" 
                      value={formatCurrency(adminStats?.monthlyRevenue || 0, displayCurrency)}
                      icon={DollarSign}
                    />
                    <StatCard 
                      title="Annual Revenue (ARR)" 
                      value={formatCurrency(adminStats?.arr || 0, displayCurrency)}
                      icon={TrendingUp}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <UserGrowthChart color="hsl(var(--primary))" />
                    <DocumentCompletionChart color="hsl(142 76% 36%)" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-1">
                    <ApiUsageChart color="hsl(220 70% 50%)" />
                  </div>
                </>
              )}
            </TabsContent>
          )}

          {effectiveRole && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}

          {effectiveRole && (
            <TabsContent value="promo-codes">
              <PromoCodesManagement />
            </TabsContent>
          )}

          {/* Subscription tab - only for non-admin users */}
          {!effectiveRole && (
            <TabsContent value="subscription">
              <SubscriptionManagement />
            </TabsContent>
          )}

          {/* Settings tab - only for non-admin users */}
          {!effectiveRole && (
            <TabsContent value="settings">
              <div className="space-y-6">
                {/* Profile Settings */}
                <ProfileSettings />
                
                {/* Account Security */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5" />
                      Account Security
                    </CardTitle>
                    <CardDescription>
                      Manage your account security settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <TwoFactorSetup
                      isEnabled={user?.twoFactorEnabled || false}
                      onUpdate={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] })}
                    />
                  </CardContent>
                </Card>

                {/* Identity Verification - Pro feature */}
                <IdentityVerification />

                {/* Team Management - Pro feature */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team Management
                      <Crown className="h-4 w-4 text-yellow-500" />
                    </CardTitle>
                    <CardDescription>
                      Collaborate with your team members
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isPro ? (
                      <Link href="/team-settings">
                        <Button variant="outline" data-testid="button-team-settings">
                          <Users className="h-4 w-4 mr-2" />
                          Manage Team
                        </Button>
                      </Link>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p className="mb-3">Invite team members to collaborate on documents and share templates.</p>
                        <Link href="/dashboard?tab=subscription">
                          <Button variant="outline" size="sm" data-testid="button-upgrade-team">
                            <Crown className="h-4 w-4 mr-2 text-yellow-500" />
                            Upgrade to Pro
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Storage & Data - Pro feature */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5" />
                      Storage & Data
                      <Crown className="h-4 w-4 text-yellow-500" />
                    </CardTitle>
                    <CardDescription>
                      Manage where your documents are stored
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isPro ? (
                      <Link href="/storage-settings">
                        <Button variant="outline" data-testid="button-storage-settings">
                          <HardDrive className="h-4 w-4 mr-2" />
                          Storage Settings
                        </Button>
                      </Link>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p className="mb-3">Connect your own storage (S3, Google Drive, Dropbox) and choose your data region.</p>
                        <Link href="/dashboard?tab=subscription">
                          <Button variant="outline" size="sm" data-testid="button-upgrade-storage">
                            <Crown className="h-4 w-4 mr-2 text-yellow-500" />
                            Upgrade to Pro
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Billing & Invoices - only for Pro users */}
                {isPro && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Receipt className="h-5 w-5" />
                        Billing & Invoices
                      </CardTitle>
                      <CardDescription>
                        View your subscription and download invoices
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Link href="/billing">
                        <Button variant="outline" data-testid="button-billing">
                          <Receipt className="h-4 w-4 mr-2" />
                          View Billing
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          )}

          {effectiveRole && (
            <TabsContent value="storage">
              <StorageSettings />
            </TabsContent>
          )}

          {/* Guides Management tab */}
          {effectiveRole && (
            <TabsContent value="guides">
              <GuidesManagement />
            </TabsContent>
          )}

          {/* Admin Settings tab */}
          {effectiveRole && (
            <TabsContent value="admin-settings">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Platform Settings</CardTitle>
                    <CardDescription>
                      Configure platform-wide settings and preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="currency-select">Display Currency</Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Choose the currency for displaying revenue metrics
                      </p>
                      <Select
                        value={displayCurrency}
                        onValueChange={(value) => updateSettingsMutation.mutate({ displayCurrency: value })}
                      >
                        <SelectTrigger id="currency-select" className="w-48" data-testid="select-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      {updateSettingsMutation.isPending && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving...
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <InvoiceSettings 
                  settings={adminSettings} 
                  onSave={(data) => updateSettingsMutation.mutate(data)}
                  isSaving={updateSettingsMutation.isPending}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
      </main>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Create Signing Request
            </DialogTitle>
            <DialogDescription>
              Generate a new lease document for electronic signature
            </DialogDescription>
          </DialogHeader>

          {createdResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Document Created</span>
              </div>
              
              <div className="space-y-2">
                <Label>Document ID</Label>
                <p className="text-sm font-mono bg-muted p-2 rounded-md break-all" data-testid="text-created-doc-id">
                  {createdResult.document_id}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Signing URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={createdResult.signing_url}
                    className="font-mono text-xs"
                    data-testid="input-created-signing-url"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleCopyUrl(createdResult.signing_url)}
                    data-testid="button-copy-created-url"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(createdResult.signing_url, "_blank")}
                  data-testid="button-open-created"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </Button>
                <Button className="flex-1" onClick={resetCreateDialog} data-testid="button-done">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tenantName">Tenant Name</Label>
                <Input
                  id="tenantName"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Enter tenant name"
                  required
                  data-testid="input-create-tenant-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenantEmail">Tenant Email</Label>
                <Input
                  id="tenantEmail"
                  type="email"
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  placeholder="Enter tenant email"
                  required
                  data-testid="input-create-tenant-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="propertyAddress">Property Address</Label>
                <Input
                  id="propertyAddress"
                  value={propertyAddress}
                  onChange={(e) => setPropertyAddress(e.target.value)}
                  placeholder="Enter property address"
                  required
                  data-testid="input-create-property"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rent">Monthly Rent ($)</Label>
                <Input
                  id="rent"
                  type="number"
                  value={rent}
                  onChange={(e) => setRent(e.target.value)}
                  placeholder="Enter monthly rent"
                  required
                  data-testid="input-create-rent"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createDocumentMutation.isPending}
                data-testid="button-submit-create"
              >
                {createDocumentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Create Document
                  </>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Details Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDocument && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Details
                </DialogTitle>
                <DialogDescription>
                  {selectedDocument.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                {/* Status and info */}
                <div className="flex items-center gap-4 flex-wrap">
                  {getStatusBadge(selectedDocument.status)}
                  <span className="text-sm text-muted-foreground">
                    Created: {formatDate(selectedDocument.createdAt)}
                  </span>
                </div>

                {/* Document data */}
                {selectedDocument.dataJson && typeof selectedDocument.dataJson === 'object' && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Document Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {/* Basic info - filter out complex objects */}
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(selectedDocument.dataJson as Record<string, any>)
                          .filter(([key, value]) => !Array.isArray(value) && typeof value !== 'object')
                          .map(([key, value]) => (
                            <div key={key}>
                              <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span>{" "}
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                      </div>
                      
                      {/* Signers section */}
                      {(selectedDocument.dataJson as Record<string, any>).signers && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Signers
                          </h4>
                          <div className="space-y-2">
                            {((selectedDocument.dataJson as Record<string, any>).signers as Array<{id: string; name: string; email: string}>).map((signer, idx) => (
                              <div key={signer.id || idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                <div>
                                  <p className="font-medium">{signer.name}</p>
                                  <p className="text-xs text-muted-foreground">{signer.email}</p>
                                </div>
                                <Badge variant="outline">Signer {idx + 1}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Fields section */}
                      {(selectedDocument.dataJson as Record<string, any>).fields && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Signature Fields ({((selectedDocument.dataJson as Record<string, any>).fields as Array<any>).length})
                          </h4>
                          <div className="grid gap-1">
                            {((selectedDocument.dataJson as Record<string, any>).fields as Array<{id: string; fieldType: string; page: number; signerId: string}>).map((field, idx) => {
                              const signers = (selectedDocument.dataJson as Record<string, any>).signers as Array<{id: string; name: string}> || [];
                              const signer = signers.find(s => s.id === field.signerId);
                              return (
                                <div key={field.id || idx} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                                  <span className="capitalize">{field.fieldType}</span>
                                  <span className="text-muted-foreground">Page {field.page}</span>
                                  <span className="text-muted-foreground">{signer?.name || field.signerId}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Signing URL */}
                {selectedDocument.status !== "completed" && (
                  <div className="space-y-2">
                    <Label>Signing URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/d/${selectedDocument.id}?token=${selectedDocument.signingToken}`}
                        className="font-mono text-xs"
                        data-testid="input-signing-url"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleCopyUrl(`${window.location.origin}/d/${selectedDocument.id}?token=${selectedDocument.signingToken}`)}
                        data-testid="button-copy-url"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Email Notifications */}
                {selectedDocument.status !== "completed" && (() => {
                  const docSigners = (selectedDocument.dataJson as Record<string, any>)?.signers as Array<{id: string; name: string; email: string; status?: string}> || [];
                  const hasSigners = docSigners.length > 0;
                  
                  return (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Send Email Notification
                        </CardTitle>
                        <CardDescription>
                          Send a signature request or reminder to a signer
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {hasSigners ? (
                          <>
                            <div className="space-y-1">
                              <Label htmlFor="signer-select">Select Signer</Label>
                              <Select
                                value={emailRecipient}
                                onValueChange={(value) => {
                                  setEmailRecipient(value);
                                  const signer = docSigners.find(s => s.email === value);
                                  setEmailRecipientName(signer?.name || "");
                                }}
                              >
                                <SelectTrigger id="signer-select" data-testid="select-signer">
                                  <SelectValue placeholder="Choose a signer..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {docSigners.map((signer) => (
                                    <SelectItem key={signer.id} value={signer.email}>
                                      {signer.name} ({signer.email})
                                      {signer.status === "signed" && " - Signed"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                onClick={() => handleSendEmail(selectedDocument.id, "signature_request")}
                                disabled={isSendingEmail || !emailRecipient}
                                data-testid="button-send-signature-request"
                              >
                                {isSendingEmail ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Send Signature Request
                              </Button>
                              {selectedDocument.status === "sent" && (
                                <Button
                                  variant="outline"
                                  onClick={() => handleSendEmail(selectedDocument.id, "reminder")}
                                  disabled={isSendingEmail || !emailRecipient}
                                  data-testid="button-send-reminder"
                                >
                                  {isSendingEmail ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                  )}
                                  Send Reminder
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="grid gap-3">
                            <div className="space-y-1">
                              <Label htmlFor="email-recipient">Recipient Email</Label>
                              <Input
                                id="email-recipient"
                                type="email"
                                placeholder="signer@example.com"
                                value={emailRecipient}
                                onChange={(e) => setEmailRecipient(e.target.value)}
                                data-testid="input-email-recipient"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="email-name">Recipient Name (optional)</Label>
                              <Input
                                id="email-name"
                                type="text"
                                placeholder="John Doe"
                                value={emailRecipientName}
                                onChange={(e) => setEmailRecipientName(e.target.value)}
                                data-testid="input-email-name"
                              />
                            </div>
                            <Button
                              onClick={() => handleSendEmail(selectedDocument.id, "signature_request")}
                              disabled={isSendingEmail || !emailRecipient}
                              data-testid="button-send-signature-request"
                            >
                              {isSendingEmail ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Send className="h-4 w-4 mr-2" />
                              )}
                              Send Signature Request
                            </Button>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Note: In development mode, emails are logged to the server console instead of being sent.
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* SHA-256 for completed docs */}
                {selectedDocument.signedPdfSha256 && (
                  <div className="space-y-2">
                    <Label>Signed PDF SHA-256</Label>
                    <p className="text-xs font-mono bg-muted p-2 rounded-md break-all">
                      {selectedDocument.signedPdfSha256}
                    </p>
                  </div>
                )}

                {/* Audit Events */}
                {selectedDocument.auditEvents && selectedDocument.auditEvents.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Audit Trail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedDocument.auditEvents.map((event) => {
                          const meta = event.metaJson as Record<string, any> | null;
                          const signerEmail = meta?.signerEmail;
                          const signerRole = meta?.signerRole;
                          const orderIndex = meta?.orderIndex;
                          
                          // Get signer name from document signers if available
                          const signers = (selectedDocument.dataJson as Record<string, any>)?.signers as Array<{id: string; name: string; email: string}> || [];
                          const signer = signers.find(s => s.email === signerEmail || s.id === signerRole);
                          
                          return (
                            <div key={event.id} className="flex justify-between items-start text-sm border-b pb-2 last:border-0">
                              <div>
                                <span className="font-medium">{event.event.replace(/_/g, " ")}</span>
                                {(signer || signerEmail) && (
                                  <p className="text-xs text-muted-foreground">
                                    {signer?.name || signerEmail}
                                    {orderIndex !== undefined && ` (Signer ${orderIndex + 1})`}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  IP: {event.ip || "N/A"}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(event.createdAt)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
