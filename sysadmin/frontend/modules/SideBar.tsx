import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from '@/components/ui/sidebar';

export type MenuItem = {
    label: string;
    path: string;
}

export const LeftSideBar: React.FC<{ menuItems: MenuItem[] }> = ({ menuItems }) => {
    const location = useLocation();

    return (
        <SidebarProvider
            className="min-h-screen shrink-0 
            "
            style={{ width: '16rem', flex: '0 0 16rem' }}
        >
            <Sidebar collapsible="none" className="min-h-screen w-full dark border-r border-border ">
                <SidebarHeader >
                    <div className="flex items-center justify-center bg-accent rounded gap-2 px-4 py-3">
                        <span className="text-lg font-semibold text-slate-100">SysAdmin</span>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarMenu>
                        {menuItems.map((item, index) => (
                            <SidebarMenuItem key={index}>
                                <SidebarMenuButton
                                    render={<Link to={item.path} />}
                                    isActive={location.pathname === item.path}
                                    className="text-md"
                                >
                                    {item.label}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                        </SidebarMenu>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter>
                    <div className="flex items-center justify-center  rounded gap-2 px-4 py-3">
                        <span className="text-sm text-slate-100">vintador44 & Konstach</span>
                    </div>
                </SidebarFooter>
            
            </Sidebar>
        </SidebarProvider>
    );
};




