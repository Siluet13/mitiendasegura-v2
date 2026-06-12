import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Database, LayoutDashboard, LogOut, Package, Settings, ShoppingCart, Tags, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Productos", url: "/products", icon: Package },
  { title: "Categorías", url: "/categories", icon: Tags },
  { title: "Movimientos", url: "/stock-movements", icon: ArrowLeftRight },
  { title: "Ventas", url: "/sales", icon: ShoppingCart },
  { title: "Clientes", url: "/customers", icon: Users },
  { title: "Configuración", url: "/settings", icon: Settings },
  { title: "Backup", url: "/backup", icon: Database },
] as const;

export function AppSidebar() {
  const { user } = useAuth();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="px-2 py-1.5 text-sm font-semibold">Stock</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menú</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={currentPath === item.url}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-2 text-xs text-muted-foreground truncate">
          {user?.email ?? user?.firstName ?? ""}
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/api/logout">
                <LogOut className="h-4 w-4" />
                <span>Cerrar sesión</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
