import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Download, UserPlus } from 'lucide-react';
import DashboardLayout from '@/layouts/DashboardLayout';
import MemberCard from '@/components/MemberCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Gender, Member } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { mapDbMemberToMember } from '@/lib/db-types';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';


const Members = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
    localStorage.removeItem('token');
    navigate('/login');
  };

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        console.log('Starting to fetch members...');

        // First, try to fetch residences
        const { data: residencesData, error: residencesError } = await supabase
          .from('residences')
          .select('*');

        if (residencesError) {
          console.error('Error fetching residences:', residencesError);
          throw residencesError;
        }

        console.log('Residences data:', residencesData);

        // Get all members from Supabase
        const { data: membersData, error: membersError } = await supabase
          .from('members')
          .select(`
            *,
            dependants (*)
          `);

        if (membersError) {
          console.error('Error fetching members:', membersError);
          throw membersError;
        }

        console.log('Members data:', membersData);

        // Map database members to the application Member model
        const mappedMembers = membersData.map(dbMember => {
          try {
            return mapDbMemberToMember(dbMember, dbMember.dependants || []);
          } catch (error) {
            console.error('Error mapping member:', dbMember, error);
            return null;
          }
        }).filter(Boolean) as Member[]; // Remove any null values from mapping errors

        console.log('Mapped members:', mappedMembers);

        // Extract unique locations from residences
        const uniqueLocations = [...new Set(residencesData.map(r => r.name))];
        console.log('Unique locations:', uniqueLocations);

        setMembers(mappedMembers);
        setLocations(uniqueLocations);
      } catch (error) {
        console.error('Error in fetchMembers:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error instanceof Error 
            ? error.message 
            : 'Failed to load members. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  const filteredMembers = members.filter((member) => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.memberNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.phoneNumber && member.phoneNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (member.emailAddress && member.emailAddress.toLowerCase().includes(searchQuery.toLowerCase())) ||
      member.nationalIdNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && member.isActive) ||
      (statusFilter === 'inactive' && !member.isActive);
    
    const matchesLocation = 
      locationFilter === 'all' ||
      member.residence.toLowerCase() === locationFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesLocation;
  });

  return (
    <DashboardLayout customLogout={handleLogout}>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Members</h1>
            <p className="text-muted-foreground">Manage community members</p>
          </div>
          <Button onClick={() => navigate('/members/new')}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add New Member
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search members..."
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location} value={location.toLowerCase()}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Filter Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  Gender
                </DropdownMenuItem>
                <DropdownMenuItem>
                  Age Range
                </DropdownMenuItem>
                <DropdownMenuItem>
                  Registration Date
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
            </div>
        ) : filteredMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onClick={() => navigate(`/members/${member.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-lg font-medium mb-2">No members found</p>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all' || locationFilter !== 'all' 
                ? "Try changing your search or filters" 
                : "Add a new member to get started"}
            </p>
            {!searchQuery && statusFilter === 'all' && locationFilter === 'all' && (
              <Button onClick={() => navigate('/members/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
          )}
        </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Members;
