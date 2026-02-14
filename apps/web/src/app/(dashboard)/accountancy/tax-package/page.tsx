'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, Download, Loader2, FileText } from 'lucide-react';

const PACKAGE_ITEMS = [
  'Cover letter',
  'Profit & Loss statement',
  'Balance Sheet',
  'Form 1120 (pre-filled)',
  'W-2 forms (all employees)',
  '1099-NEC forms (contractors)',
  'Depreciation schedule',
  'General Ledger (Excel)',
  'Expense details (Excel)',
  'Blockchain verification report',
];

export default function TaxPackagePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const [generating, setGenerating] = useState(false);
  const [packageData, setPackageData] = useState<{
    packageId: string;
    url: string;
    files: string[];
    size: number;
  } | null>(null);
  const [history, setHistory] = useState<
    { id: string; tax_year: number; generated_at: string; file_url: string | null; status: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      const list = await api.tax.packages();
      setHistory(Array.isArray(list) ? list : []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setPackageData(null);
    try {
      const result = await api.tax.generatePackage(year);
      setPackageData(result);
      loadHistory();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate tax package');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Package Generator"
        description="Generate a complete tax package for your accountant"
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate Tax Package</CardTitle>
          <CardDescription>
            Creates a ZIP file with all tax forms and supporting documents for the selected year.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium">Tax Year</label>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(parseInt(v, 10))}
            >
              <SelectTrigger className="mt-1 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/30 p-6">
            <h4 className="mb-3 font-semibold">Package includes</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {PACKAGE_ITEMS.map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="lg"
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating package…
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate {year} Tax Package
              </>
            )}
          </Button>

          {packageData && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>Package ready</AlertTitle>
              <AlertDescription>
                Your tax package is ready ({(packageData.size / 1024).toFixed(1)} KB).
                <div className="mt-3 flex gap-2">
                  <Button size="sm" asChild>
                    <a href={packageData.url} download target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-3 w-3" />
                      Download ZIP
                    </a>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent packages</CardTitle>
            <CardDescription>Previously generated tax packages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div>
                    <p className="font-medium">{pkg.tax_year} Tax Package</p>
                    <p className="text-sm text-muted-foreground">
                      Generated {new Date(pkg.generated_at).toLocaleDateString()} • {pkg.status}
                    </p>
                  </div>
                  {pkg.file_url && pkg.status === 'completed' && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={pkg.file_url} download target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
