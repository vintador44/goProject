import React from 'react';
import "../styles/information_container.css"
import { sysmon } from "../wailsjs/go/models";


export type InformationContainerProps = {
    title: string;
    labels: string[];
    targetNumberLabel: number | null;

}

export const InformationContainer: React.FC<InformationContainerProps> = ({ title, labels , targetNumberLabel }) => {
    return (

        <div className="information_container">
            <h5 className = "ic_title">{title}</h5>
            <ul className = "ic_labels">
                {labels.map((item, index) => {
                    return <li key={index} className = "ic_label">{item}</li>;
                })}
            </ul>
            {targetNumberLabel && <p>{targetNumberLabel}</p>}
        </div>

    );
};




