import {
  Scan,
  Package,
  AlertTriangle,
  Download,
  Upload,
  RefreshCw,
  Settings,
  FileText,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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

const navItems = [
  { title: "Scan / Search", url: "/", icon: Scan },
  { title: "Products", url: "/products", icon: Package },
  { title: "Review Queue", url: "/review", icon: AlertTriangle },
  { title: "Exports", url: "/exports", icon: Download },
  { title: "Import Stock", url: "/import", icon: Upload },
  { title: "Channel Sync", url: "/sync", icon: RefreshCw },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Audit Log", url: "/audit", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
            <Package className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">
                PharmaBay
              </span>
              <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">
                Lister
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="text-[10px] text-sidebar-foreground/40 text-center">
            PharmaBay Lister v1.0
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
