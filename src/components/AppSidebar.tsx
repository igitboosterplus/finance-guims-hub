import { LayoutDashboard, Plus, Users, FileText, Bell, UserCircle, Package } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { departments } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { getUnseenAuditCount, getAllUsers, hasDepartmentAccess, hasPermission } from "@/lib/auth";
import logoGuimsGroup from "@/assets/logo-guims-group.jpg";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superadmin';
  const unseenCount = isSuperAdmin ? getUnseenAuditCount() : 0;
  const pendingUsers = isSuperAdmin ? getAllUsers().filter(u => !u.approved).length : 0;
  const accessibleDepts = departments.filter(d => hasDepartmentAccess(user, d.id));
  const canCreate = hasPermission(user, 'canCreateTransaction');

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <img src={logoGuimsGroup} alt="Guims Group" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <div>
              <h2 className="text-sm font-bold text-sidebar-foreground">Guims Finance</h2>
              <p className="text-[10px] text-sidebar-foreground/50">Petit à petit, on y arrivera</p>
            </div>
          </div>
        ) : (
          <img src={logoGuimsGroup} alt="Guims Group" className="h-8 w-8 rounded-lg object-cover mx-auto" />
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-semibold">
            Général
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/"
                    end
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Tableau de bord</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-semibold">
            Départements
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accessibleDepts.map((dept) => (
                <SidebarMenuItem key={dept.id}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/department/${dept.id}`}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <img src={dept.logo} alt={dept.name} className="mr-2 h-5 w-5 rounded-md object-cover" />
                      {!collapsed && <span>{dept.name}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {accessibleDepts.some(d => d.id === 'gaba') && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/gaba/stock"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Package className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Stock GABA</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {canCreate && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-semibold">
            Actions
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/transaction/new"
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Nouvelle transaction</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-semibold">
            Mon compte
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/profile"
                    className="hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    {!collapsed && <span>Mon profil</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] uppercase tracking-widest font-semibold">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/users"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex items-center gap-2">
                          Utilisateurs
                          {pendingUsers > 0 && (
                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-warning text-warning-foreground text-[10px] font-bold px-1">
                              {pendingUsers}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/audit"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {!collapsed && (
                        <span className="flex items-center gap-2">
                          Journal d'audit
                          {unseenCount > 0 && (
                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                              {unseenCount}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/30 text-center">
            © 2026 Guims Group — Tous droits réservés
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
