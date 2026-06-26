import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { memberLinks, memberLogout } from "./memberLinks";
import { DEPENDANT_COLUMNS } from "@/lib/supabaseSelectColumns";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Users, PlusCircle, Pencil, Trash2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface DependantRow {
  id: string;
  member_id: string;
  name: string;
  gender: string;
  relationship: string;
  date_of_birth: string;
  is_disabled: boolean;
  is_eligible: boolean;
}

interface FormData {
  name: string;
  gender: string;
  relationship: string;
  date_of_birth: string;
  is_disabled: boolean;
  is_eligible: boolean;
}

const emptyForm = (): FormData => ({
  name: "",
  gender: "",
  relationship: "",
  date_of_birth: "",
  is_disabled: false,
  is_eligible: true,
});

const MemberDependants = () => {
  const navigate = useNavigate();
  const [dependants, setDependants] = useState<DependantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<DependantRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const memberId =
    typeof window !== "undefined"
      ? localStorage.getItem("member_member_id")
      : null;

  const fetchDependants = useCallback(async () => {
    if (!memberId) return;
    try {
      const { data, error } = await supabase
        .from("dependants")
        .select(DEPENDANT_COLUMNS)
        .eq("member_id", memberId)
        .order("name");
      if (error) throw error;
      setDependants(data || []);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    if (!memberId) {
      navigate("/member/login");
      return;
    }
    fetchDependants();
  }, [memberId, navigate, fetchDependants]);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (d: DependantRow) => {
    setEditId(d.id);
    setForm({
      name: d.name,
      gender: d.gender,
      relationship: d.relationship,
      date_of_birth: d.date_of_birth?.slice(0, 10) || "",
      is_disabled: d.is_disabled,
      is_eligible: d.is_eligible,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!memberId) return;
    if (!form.name.trim() || !form.gender || !form.relationship || !form.date_of_birth) {
      toast({ variant: "destructive", title: "Validation", description: "Name, gender, relationship, and date of birth are required." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gender: form.gender,
        relationship: form.relationship,
        date_of_birth: form.date_of_birth,
        is_disabled: form.is_disabled,
        is_eligible: form.is_eligible,
      } as any;

      if (editId) {
        const { error } = await supabase
          .from("dependants")
          .update(payload)
          .eq("id", editId)
          .eq("member_id", memberId);
        if (error) throw error;
        toast({ title: "Dependant updated" });
      } else {
        payload.member_id = memberId;
        const { error } = await supabase.from("dependants").insert(payload);
        if (error) throw error;
        toast({ title: "Dependant added" });
      }

      setDialogOpen(false);
      await fetchDependants();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("dependants")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("member_id", memberId);
      if (error) throw error;
      toast({ title: "Dependant removed" });
      setDeleteTarget(null);
      await fetchDependants();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setDeleting(false);
    }
  };

  const calcAge = (dob: string) => {
    if (!dob) return "-";
    const diff = Date.now() - new Date(dob).getTime();
    return String(Math.floor(diff / 31557600000));
  };

  return (
    <DashboardLayout
      customLinks={memberLinks}
      customLogout={() => memberLogout(navigate)}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">My Dependants</h1>
            <p className="text-muted-foreground">Manage your registered dependants</p>
          </div>
          <Button onClick={openAdd}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Dependant
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        ) : dependants.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-medium mb-1">No Dependants</h3>
                <p className="text-muted-foreground mb-4">
                  You haven't registered any dependants yet.
                </p>
                <Button variant="outline" onClick={openAdd}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Your First Dependant
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dependants.map((d) => (
              <Card key={d.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-2 border-b">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{d.name}</CardTitle>
                      <CardDescription>{d.relationship}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(d)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{d.gender}</Badge>
                    {d.is_disabled && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Disabled
                      </Badge>
                    )}
                    <Badge variant="outline" className={d.is_eligible ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-red-100 text-red-800 hover:bg-red-100"}>
                      {d.is_eligible ? "Eligible" : "Not Eligible"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    DOB: {d.date_of_birth ? format(new Date(d.date_of_birth), "MMM d, yyyy") : "-"}
                    <span className="mx-2">•</span>
                    Age: {calcAge(d.date_of_birth)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Dependant" : "Add Dependant"}</DialogTitle>
            <DialogDescription>
              {editId ? "Update the dependant's details below." : "Fill in the details to register a new dependant."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dependant's full name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spouse">Spouse</SelectItem>
                    <SelectItem value="Child">Child</SelectItem>
                    <SelectItem value="Parent">Parent</SelectItem>
                    <SelectItem value="Sibling">Sibling</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_disabled} onChange={(e) => setForm({ ...form, is_disabled: e.target.checked })} className="h-4 w-4" />
                Has disability
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_eligible} onChange={(e) => setForm({ ...form, is_eligible: e.target.checked })} className="h-4 w-4" />
                Eligible for benefits
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Dependant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.name}</strong> as a dependant? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default MemberDependants;
