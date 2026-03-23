import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '../components/ui/dialog';
import { Shield, UserPlus, Trash2, ShieldAlert } from 'lucide-react';
import { Select } from '../components/ui/select';

export default function AccessManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Add User State
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('admin');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(query(usersRef));
      const fetchedUsers = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push({ id: doc.id, ...doc.data() });
      });
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async () => {
    if (!newEmail) return;
    const emailKey = newEmail.toLowerCase().trim();
    try {
      await setDoc(doc(db, 'users', emailKey), {
        email: emailKey,
        role: newRole,
        createdAt: new Date().toISOString()
      }, { merge: true });
      setNewEmail('');
      setNewRole('admin');
      setAddDialogOpen(false);
      fetchUsers();
    } catch (error) {
      console.error("Error adding user:", error);
      alert("Failed to add user.");
    }
  };

  const handleRemoveUser = async (emailKey) => {
    if (emailKey === user.email.toLowerCase()) {
      alert("You cannot remove yourself.");
      return;
    }
    if (confirm(`Are you sure you want to revoke access for ${emailKey}?`)) {
      try {
        await deleteDoc(doc(db, 'users', emailKey));
        fetchUsers();
      } catch (error) {
        console.error("Error removing user:", error);
      }
    }
  };

  const handleChangeRole = async (emailKey, updatedRole) => {
    if (emailKey === user.email.toLowerCase()) {
      alert("You cannot change your own role.");
      return;
    }
    try {
      await setDoc(doc(db, 'users', emailKey), { role: updatedRole }, { merge: true });
      fetchUsers();
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1rem', color: 'var(--destructive)' }}>
        <ShieldAlert size={48} style={{ opacity: 0.8 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Elevated Privileges Required</h2>
        <p style={{ color: 'var(--muted-foreground)' }}>Only Super Administrators can access this area.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.03em' }}>Access Management</h1>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.925rem', marginTop: '0.25rem' }}>Manage system access, roles, and administrative privileges.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus size={18} />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Grant System Access</DialogTitle></DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Google Email Address</label>
                  <Input 
                    type="email" 
                    placeholder="user@example.com" 
                    value={newEmail} 
                    onChange={(e) => setNewEmail(e.target.value)} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-foreground)' }}>Assigned Role</label>
                  <Select 
                    value={newRole} 
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="admin">Administrator (Standard Access)</option>
                    <option value="super_admin">Super Administrator (Full System Control)</option>
                  </Select>
                </div>
                <Button onClick={handleAddUser} disabled={!newEmail} style={{ marginTop: '0.5rem' }}>Grant Access</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table wrapperStyle={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
          <TableHeader style={{ backgroundColor: 'var(--background)' }}>
            <TableRow>
              <TableHead>User Identity</TableHead>
              <TableHead>Email Address</TableHead>
              <TableHead>Role</TableHead>
              <TableHead style={{ textAlign: 'center' }}>Last Login</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)' }}>
                  Loading access directory...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)' }}>
                  No users found in the registry.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <img 
                        src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.email || 'User')}`}
                        alt="" 
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName || u.email || 'User')}`;
                        }}
                        style={{ width: '2rem', height: '2rem', borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{u.displayName || 'Pending Registration'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>UID: {u.uid ? u.uid.substring(0,8) + '...' : 'N/A'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: '0.875rem' }}>{u.email}</span>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={u.role} 
                      onChange={(e) => handleChangeRole(u.id, e.target.value)}
                      disabled={u.email === user.email.toLowerCase()}
                      style={{ 
                        width: '180px', 
                        height: '2rem', 
                        fontSize: '0.75rem',
                        backgroundColor: u.role === 'super_admin' ? 'rgba(56, 189, 248, 0.1)' : 'var(--secondary)',
                        color: u.role === 'super_admin' ? '#0284c7' : 'var(--foreground)',
                        border: 'none',
                        fontWeight: 600
                      }}
                    >
                      <option value="admin">Administrator</option>
                      <option value="super_admin">Super Admin</option>
                    </Select>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}
                  </TableCell>
                  <TableCell style={{ textAlign: 'right' }}>
                    <button 
                      onClick={() => handleRemoveUser(u.id)}
                      disabled={u.email === user.email.toLowerCase()}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: u.email === user.email.toLowerCase() ? 'var(--border)' : '#a1a1aa', 
                        cursor: u.email === user.email.toLowerCase() ? 'not-allowed' : 'pointer', 
                        padding: '0.5rem' 
                      }}
                      onMouseOver={(e) => { if (u.email !== user.email.toLowerCase()) e.currentTarget.style.color = 'var(--destructive)'; }}
                      onMouseOut={(e) => { if (u.email !== user.email.toLowerCase()) e.currentTarget.style.color = '#a1a1aa'; }}
                      title="Revoke Access"
                    >
                      <Trash2 size={16} />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
