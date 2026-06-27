import { SettingsTabContent } from '../SettingsViewParts';
import { AssistantSettingsGroup } from './AssistantSettingsGroup';
import { McpServerSettingsGroup } from './McpServerSettingsGroup';

export function SettingsAiTab() {
    return (
        <SettingsTabContent value="ai">
            <AssistantSettingsGroup />
            <McpServerSettingsGroup />
        </SettingsTabContent>
    );
}
