import * as React from "react";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Form schema validation
const feeSchema = z.object({
  memberId: z.string().min(1, { message: "Member is required" }),
  amount: z
    .string()
    .min(1, { message: "Amount is required" })
    .refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0;
      },
      { message: "Amount must be a positive number" }
    ),
  reference: z.string().optional(),
  description: z.string().min(3, { message: "Description is required" }),
});

interface FeeCollectionDialogProps {
  feeType: "registration" | "renewal" | "penalty";
  buttonLabel: string;
  defaultAmount: number;
  onSuccess: () => void;
}

type Member = {
  id: string;
  name: string;
  member_number: string;
};

const FeeCollectionDialog = ({
  feeType,
  buttonLabel,
  defaultAmount,
  onSuccess,
}: FeeCollectionDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const titleMap = {
    registration: "Collect Registration Fee",
    renewal: "Collect Renewal Fee",
    penalty: "Collect Penalty Fee",
  };

  const descriptionMap = {
    registration: "Collect registration fee from a member",
    renewal: "Collect annual renewal fee from a member",
    penalty: "Collect penalty fee from a member",
  };

  const defaultDescriptionMap = {
    registration: "Registration fee payment",
    renewal: "Annual renewal fee payment",
    penalty: "Penalty fee payment for account reactivation",
  };

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, member_number")
        .order("name");

      if (error) {
        console.error("Error fetching members:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load members. Please try again.",
        });
        return;
      }

      setMembers(data || []);
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open]);

  const form = useForm<z.infer<typeof feeSchema>>({
    resolver: zodResolver(feeSchema),
    defaultValues: {
      memberId: "",
      amount: defaultAmount.toString(),
      reference: "",
      description: defaultDescriptionMap[feeType],
    },
  });

  const handleCollectFee = async (values: z.infer<typeof feeSchema>) => {
    try {
      setIsSubmitting(true);
      
      // Convert amount to a number
      const amount = parseFloat(values.amount);
      
      // Create a transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from("transactions")
        .insert({
          member_id: values.memberId,
          amount: amount,
          transaction_type: feeType,
          mpesa_reference: values.reference || null,
          description: values.description,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (transactionError) throw transactionError;
      
      // If collecting a penalty or registration fee, should also update the member's status
      if (feeType === "penalty" || feeType === "registration") {
        const { error: updateError } = await supabase
          .from("members")
          .update({ is_active: true })
          .eq("id", values.memberId);

        if (updateError) throw updateError;
      }
      
      toast({
        title: "Fee collected successfully",
        description: `${titleMap[feeType]} of KES ${amount.toLocaleString()} has been collected.`,
      });
      
      // Reset form and close dialog
      form.reset({
        memberId: "",
        amount: defaultAmount.toString(),
        reference: "",
        description: defaultDescriptionMap[feeType],
      });
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error("Error collecting fee:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to collect fee. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{titleMap[feeType]}</DialogTitle>
          <DialogDescription>
            {descriptionMap[feeType]}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleCollectFee)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="memberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Member</FormLabel>
                  <Select
                    disabled={isLoading}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className={cn(!field.value && "text-muted-foreground")}>
                        <SelectValue placeholder="Select a member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {isLoading ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span>Loading members...</span>
                        </div>
                      ) : members.length === 0 ? (
                        <div className="p-2 text-center text-sm">
                          No members found
                        </div>
                      ) : (
                        members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name} ({member.member_number})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (KES)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. MPESA reference" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Collect Fee
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FeeCollectionDialog;