import React from 'react';
import "../styles/sidebar.css"


class SideBarClass {

}

export type MenuItem = {
    label: string;
}

export const LeftSideBar: React.FC<{ menuItems: MenuItem[] }> = ({ menuItems }) => {
    return (
        
            <nav className="sidebar">
                <ul className="sidebar_tabs">
                    {menuItems.map((item, index) => (
                        <li key={index} className="sidebar_tab">
                            {item.label}
                        </li>
                    ))}
                </ul>
            </nav>
        
    );
};




