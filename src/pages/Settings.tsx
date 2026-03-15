import { useState, useEffect } from 'react';
import { RefreshCw, Save, Edit, X } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ResidenceForm from '@/components/forms/ResidenceForm';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';

interface Residence {
  id: string;
  name: string;
  created_at: string;
}

interface SettingsData {
  id: string;
  registration_fee: number;
  renewal_fee: number;
  penalty_amount: number;
  paybill_number: string | null;
  organization_name: string;
  organization_email: string | null;
  organization_phone: string | null;
  member_id_start: number | null;
  case_id_start: number | null;
  mpesa_consumer_key: string | null;
  mpesa_consumer_secret: string | null;
  mpesa_passkey: string | null;
  mpesa_shortcode: string | null;
  mpesa_initiator_name: string | null;
  mpesa_initiator_password: string | null;
  mpesa_env: 'sandbox' | 'production';
}

const settingsFormSchema = z.object({
  registration_fee: z.coerce.number().min(0, 'Fee must be a positive number'),
  renewal_fee: z.coerce.number().min(0, 'Fee must be a positive number'),
  penalty_amount: z.coerce.number().min(0, 'Fee must be a positive number'),
  paybill_number: z.string().optional(),
  organization_name: z.string().min(1, 'Organization name is required'),
  organization_email: z.string().email().optional().or(z.literal('')),
  organization_phone: z.string().optional().or(z.literal('')),
  member_id_start: z.coerce.number().min(1, 'Member ID start must be a positive number').optional(),
  case_id_start: z.coerce.number().min(1, 'Case ID start must be a positive number').optional(),
  mpesa_consumer_key: z.string().optional().or(z.literal('')),
  mpesa_consumer_secret: z.string().optional().or(z.literal('')),
  mpesa_passkey: z.string().optional().or(z.literal('')),
  mpesa_shortcode: z.string().optional().or(z.literal('')),
  mpesa_initiator_name: z.string().optional().or(z.literal('')),
  mpesa_initiator_password: z.string().optional().or(z.literal('')),
  mpesa_env: z.enum(['sandbox', 'production']).default('sandbox'),
});

const Settings = () => {
  const [residences, setResidences] = useState<Residence[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof settingsFormSchema>>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      registration_fee: 500,
      renewal_fee: 200,
      penalty_amount: 300,
      paybill_number: '',
      organization_name: 'Welfare Society',
      organization_email: '',
      organization_phone: '',
      member_id_start: 1,
      case_id_start: 1,
      mpesa_consumer_key: '',
      mpesa_consumer_secret: '',
      mpesa_passkey: '',
      mpesa_shortcode: '',
      mpesa_initiator_name: '',
      mpesa_initiator_password: '',
      mpesa_env: 'sandbox',
    },
  });

  useEffect(() => {
    const fetchResidences = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('residences')
          .select('*')
          .order('name', { ascending: true });
          
        if (error) throw error;
        
        setResidences(data || []);
      } catch (error) {
        console.error('Error fetching residences:', error);
        toast({
          variant: "destructive",
          title: "Failed to load residences",
          description: "There was an error loading the residence data.",
        });
      } finally {
        setLoading(false);
      }
    };

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .order('id', { ascending: true })
          .limit(1)
          .maybeSingle();
          
        if (error) {
          console.error('Error fetching settings:', error);
          return;
        }
        
        if (data) {
          setSettingsId(data.id);
          form.reset({
            registration_fee: data.registration_fee,
            renewal_fee: data.renewal_fee,
            penalty_amount: data.penalty_amount,
            paybill_number: data.paybill_number || '',
            organization_name: data.organization_name,
            organization_email: data.organization_email || '',
            organization_phone: data.organization_phone || '',
            member_id_start: data.member_id_start || 1,
            case_id_start: data.case_id_start || 1,
            mpesa_consumer_key: data.mpesa_consumer_key || '',
            mpesa_consumer_secret: data.mpesa_consumer_secret || '',
            mpesa_passkey: data.mpesa_passkey || '',
            mpesa_shortcode: data.mpesa_shortcode || '',
            mpesa_initiator_name: data.mpesa_initiator_name || '',
            mpesa_initiator_password: data.mpesa_initiator_password || '',
            mpesa_env: (data.mpesa_env as 'sandbox' | 'production') || 'sandbox',
          });
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchResidences();
    fetchSettings();
  }, [refreshTrigger, form]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleResidenceAdded = () => {
    handleRefresh();
  };

  const onSubmitSettings = async (values: z.infer<typeof settingsFormSchema>) => {
    setSavingSettings(true);
    try {
      if (settingsId) {
        const { error } = await supabase
          .from('settings')
          .update({
            registration_fee: values.registration_fee,
            renewal_fee: values.renewal_fee,
            penalty_amount: values.penalty_amount,
            paybill_number: values.paybill_number || null,
            organization_name: values.organization_name,
            organization_email: values.organization_email || null,
            organization_phone: values.organization_phone || null,
            member_id_start: values.member_id_start || 1,
            case_id_start: values.case_id_start || 1,
            mpesa_consumer_key: values.mpesa_consumer_key || null,
            mpesa_consumer_secret: values.mpesa_consumer_secret || null,
            mpesa_passkey: values.mpesa_passkey || null,
            mpesa_shortcode: values.mpesa_shortcode || null,
            mpesa_initiator_name: values.mpesa_initiator_name || null,
            mpesa_initiator_password: values.mpesa_initiator_password || null,
            mpesa_env: values.mpesa_env,
          })
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('settings')
          .insert({
            registration_fee: values.registration_fee,
            renewal_fee: values.renewal_fee,
            penalty_amount: values.penalty_amount,
            paybill_number: values.paybill_number || null,
            organization_name: values.organization_name,
            organization_email: values.organization_email || null,
            organization_phone: values.organization_phone || null,
            member_id_start: values.member_id_start || 1,
            case_id_start: values.case_id_start || 1,
            mpesa_consumer_key: values.mpesa_consumer_key || null,
            mpesa_consumer_secret: values.mpesa_consumer_secret || null,
            mpesa_passkey: values.mpesa_passkey || null,
            mpesa_shortcode: values.mpesa_shortcode || null,
            mpesa_initiator_name: values.mpesa_initiator_name || null,
            mpesa_initiator_password: values.mpesa_initiator_password || null,
            mpesa_env: values.mpesa_env,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (data?.id) setSettingsId(data.id);
      }
        
      toast({
        title: "Settings updated",
        description: "Your changes have been saved successfully.",
      });
      
      setEditingField(null);
    } catch (error: any) {
      console.error('Error updating settings:', error);
      toast({
        variant: "destructive",
        title: "Failed to update settings",
        description: error.message || "There was an error saving your changes.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleEdit = (fieldName: string) => {
    setEditingField(editingField === fieldName ? null : fieldName);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Settings</h1>
          <p className="text-muted-foreground">Manage system settings and configurations</p>
        </div>

        <Tabs defaultValue="fees">
          <TabsList>
            <TabsTrigger value="fees">Fees & Payments</TabsTrigger>
            <TabsTrigger value="ids">ID Configuration</TabsTrigger>
            <TabsTrigger value="residences">Residence Locations</TabsTrigger>
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="mpesa">M-Pesa API</TabsTrigger>
          </TabsList>
          
          <TabsContent value="fees" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Fee Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="registration_fee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Registration Fee (KES)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  readOnly={editingField !== 'registration_fee'}
                                  className={editingField !== 'registration_fee' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'registration_fee' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('registration_fee')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('registration_fee')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="renewal_fee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Annual Renewal Fee (KES)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  readOnly={editingField !== 'renewal_fee'}
                                  className={editingField !== 'renewal_fee' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'renewal_fee' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('renewal_fee')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('renewal_fee')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="penalty_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Penalty Amount (KES)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  readOnly={editingField !== 'penalty_amount'}
                                  className={editingField !== 'penalty_amount' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'penalty_amount' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('penalty_amount')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('penalty_amount')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="paybill_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>M-Pesa Paybill Number</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  {...field} 
                                  readOnly={editingField !== 'paybill_number'}
                                  className={editingField !== 'paybill_number' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'paybill_number' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('paybill_number')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('paybill_number')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="flex justify-end">
                      <Button type="submit" disabled={savingSettings || editingField === null}>
                        <Save className="w-4 h-4 mr-2" />
                        {savingSettings ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="ids" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>ID Number Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="member_id_start"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Member ID Starting Number</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  readOnly={editingField !== 'member_id_start'}
                                  className={editingField !== 'member_id_start' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'member_id_start' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('member_id_start')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('member_id_start')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              New member IDs will start from M{String(field.value || 1).padStart(3, '0')}
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="case_id_start"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Case ID Starting Number</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="number" 
                                  {...field} 
                                  readOnly={editingField !== 'case_id_start'}
                                  className={editingField !== 'case_id_start' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'case_id_start' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('case_id_start')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('case_id_start')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              New case IDs will start from C{String(field.value || 1).padStart(3, '0')}
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="flex justify-end">
                      <Button type="submit" disabled={savingSettings || editingField === null}>
                        <Save className="w-4 h-4 mr-2" />
                        {savingSettings ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="residences" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Manage Residence Locations</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRefresh} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Location
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Add New Residence Location</SheetTitle>
                    </SheetHeader>
                    <div className="py-6">
                      <ResidenceForm onSuccess={handleResidenceAdded} />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Available Locations</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-4">Loading residences...</div>
                ) : residences.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground">No residence locations found</p>
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="mt-4">
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Location
                        </Button>
                      </SheetTrigger>
                      <SheetContent>
                        <SheetHeader>
                          <SheetTitle>Add New Residence Location</SheetTitle>
                        </SheetHeader>
                        <div className="py-6">
                          <ResidenceForm onSuccess={handleResidenceAdded} />
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {residences.map((residence) => (
                      <div 
                        key={residence.id} 
                        className="border rounded-md p-4 hover:bg-accent transition-colors"
                      >
                        <p className="font-medium">{residence.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="organization">
            <Card>
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="organization_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Organization Name</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input 
                                {...field} 
                                readOnly={editingField !== 'organization_name'}
                                className={editingField !== 'organization_name' ? "bg-muted cursor-not-allowed" : ""}
                              />
                            </FormControl>
                            {editingField === 'organization_name' ? (
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => toggleEdit('organization_name')}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon"
                                onClick={() => toggleEdit('organization_name')}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="organization_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Email</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  type="email" 
                                  {...field} 
                                  readOnly={editingField !== 'organization_email'}
                                  className={editingField !== 'organization_email' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'organization_email' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('organization_email')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('organization_email')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="organization_phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Organization Phone</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input 
                                  {...field} 
                                  readOnly={editingField !== 'organization_phone'}
                                  className={editingField !== 'organization_phone' ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              {editingField === 'organization_phone' ? (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => toggleEdit('organization_phone')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button 
                                  type="button" 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => toggleEdit('organization_phone')}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="flex justify-end">
                      <Button type="submit" disabled={savingSettings || editingField === null}>
                        <Save className="w-4 h-4 mr-2" />
                        {savingSettings ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="mpesa">
            <Card>
              <CardHeader>
                <CardTitle>M-Pesa Daraja API Settings</CardTitle>
                <CardDescription>
                  Configure M-Pesa integration for STK Push, B2C payments, and reversals
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Info Banner */}
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">📋 How to Get M-Pesa Credentials</h4>
                  <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Go to <a href="https://developer.safaricom.co.ke" target="_blank" rel="noopener noreferrer" className="underline font-medium">M-Pesa Daraja Developer Portal</a></li>
                    <li>Create an account or login to your existing account</li>
                    <li>Create a new app to get your Consumer Key and Consumer Secret</li>
                    <li>For STK Push: Get your Passkey from the app settings</li>
                    <li>For B2C/Reversals: Create an initiator on the Daraja portal</li>
                    <li>Download the public key and encrypt your initiator password</li>
                  </ol>
                  <p className="text-xs text-blue-700 mt-3 font-medium">
                    ℹ️ Start with Sandbox credentials for testing, then switch to Production when ready
                  </p>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitSettings)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="mpesa_env"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Environment</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <select
                                  {...field}
                                  disabled={editingField !== 'mpesa_env'}
                                  className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${editingField !== 'mpesa_env' ? "bg-muted cursor-not-allowed" : ""}`}
                                >
                                  <option value="sandbox">🧪 Sandbox (Testing)</option>
                                  <option value="production">🚀 Production (Live)</option>
                                </select>
                              </FormControl>
                              {editingField === 'mpesa_env' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_env')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_env')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_shortcode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shortcode / Paybill Number</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} readOnly={editingField !== 'mpesa_shortcode'} className={editingField !== 'mpesa_shortcode' ? "bg-muted cursor-not-allowed" : ""} placeholder="e.g., 174379" />
                              </FormControl>
                              {editingField === 'mpesa_shortcode' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_shortcode')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_shortcode')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_consumer_key"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consumer Key</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} type="password" readOnly={editingField !== 'mpesa_consumer_key'} className={editingField !== 'mpesa_consumer_key' ? "bg-muted cursor-not-allowed" : ""} placeholder="Enter your Consumer Key" />
                              </FormControl>
                              {editingField === 'mpesa_consumer_key' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_consumer_key')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_consumer_key')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_consumer_secret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consumer Secret</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} type="password" readOnly={editingField !== 'mpesa_consumer_secret'} className={editingField !== 'mpesa_consumer_secret' ? "bg-muted cursor-not-allowed" : ""} placeholder="Enter your Consumer Secret" />
                              </FormControl>
                              {editingField === 'mpesa_consumer_secret' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_consumer_secret')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_consumer_secret')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_passkey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Passkey (for STK Push)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} type="password" readOnly={editingField !== 'mpesa_passkey'} className={editingField !== 'mpesa_passkey' ? "bg-muted cursor-not-allowed" : ""} placeholder="Enter your Passkey" />
                              </FormControl>
                              {editingField === 'mpesa_passkey' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_passkey')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_passkey')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_initiator_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Initiator Name (for B2C/Reversals)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} readOnly={editingField !== 'mpesa_initiator_name'} className={editingField !== 'mpesa_initiator_name' ? "bg-muted cursor-not-allowed" : ""} placeholder="e.g., testapi" />
                              </FormControl>
                              {editingField === 'mpesa_initiator_name' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_initiator_name')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_initiator_name')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Required for B2C payments and reversals</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="mpesa_initiator_password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Initiator Password (Security Credential)</FormLabel>
                            <div className="flex items-center gap-2">
                              <FormControl>
                                <Input {...field} type="password" readOnly={editingField !== 'mpesa_initiator_password'} className={editingField !== 'mpesa_initiator_password' ? "bg-muted cursor-not-allowed" : ""} placeholder="Enter encrypted password" />
                              </FormControl>
                              {editingField === 'mpesa_initiator_password' ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_initiator_password')}><X className="h-4 w-4" /></Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon" onClick={() => toggleEdit('mpesa_initiator_password')}><Edit className="h-4 w-4" /></Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Must be encrypted with M-Pesa public key for production</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Test Connection Button */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">Test M-Pesa Connection</h4>
                          <p className="text-xs text-muted-foreground">Verify your credentials are working</p>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={async () => {
                            try {
                              const toast = await import('@/components/ui/use-toast')
                              toast.toast({
                                title: 'Testing connection...',
                                description: 'Please wait',
                              })
                              
                              // Test by getting access token
                              const response = await fetch(
                                form.getValues('mpesa_env') === 'production'
                                  ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
                                  : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
                                {
                                  method: 'GET',
                                  headers: {
                                    Authorization: 'Basic ' + btoa(`${form.getValues('mpesa_consumer_key')}:${form.getValues('mpesa_consumer_secret')}`),
                                  },
                                }
                              )
                              
                              if (response.ok) {
                                const data = await response.json()
                                toast.toast({
                                  title: '✅ Connection Successful!',
                                  description: `Access token received. Expires in ${data.expires_in} seconds.`,
                                })
                              } else {
                                const error = await response.json()
                                toast.toast({
                                  variant: 'destructive',
                                  title: '❌ Connection Failed',
                                  description: error.error_description || 'Check your credentials',
                                })
                              }
                            } catch (error: any) {
                              const toast = await import('@/components/ui/use-toast')
                              toast.toast({
                                variant: 'destructive',
                                title: '❌ Connection Error',
                                description: error.message || 'Unable to connect to M-Pesa',
                              })
                            }
                          }}
                          disabled={!form.getValues('mpesa_consumer_key') || !form.getValues('mpesa_consumer_secret')}
                        >
                          📡 Test Connection
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={savingSettings || editingField === null}>
                        <Save className="w-4 h-4 mr-2" />
                        {savingSettings ? 'Saving...' : 'Save M-Pesa Configuration'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
