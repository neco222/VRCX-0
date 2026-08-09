import { ToolsPageContent } from './components/ToolsPageContent';
import { useToolsPageController } from './useToolsPageController';

export function ToolsPage() {
    const {
        addQuickAccessToolByKeyWithFeedback,
        categories,
        collapsed,
        handleQuickAccessDragEnd,
        isQuickAccessEditing,
        pinToolToNav,
        pinnedToolKeys,
        quickAccessKeySet,
        quickAccessTools,
        removeQuickAccessToolByKey,
        sensors,
        setIsQuickAccessEditing,
        shouldShowQuickAccess,
        toggleCategoryCollapsed,
        triggerTool,
        unpinToolFromNav
    } = useToolsPageController();

    return (
        <ToolsPageContent
            addQuickAccessToolByKeyWithFeedback={
                addQuickAccessToolByKeyWithFeedback
            }
            categories={categories}
            collapsed={collapsed}
            handleQuickAccessDragEnd={handleQuickAccessDragEnd}
            isQuickAccessEditing={isQuickAccessEditing}
            pinToolToNav={pinToolToNav}
            pinnedToolKeys={pinnedToolKeys}
            quickAccessKeySet={quickAccessKeySet}
            quickAccessTools={quickAccessTools}
            removeQuickAccessToolByKey={removeQuickAccessToolByKey}
            sensors={sensors}
            setIsQuickAccessEditing={setIsQuickAccessEditing}
            shouldShowQuickAccess={shouldShowQuickAccess}
            toggleCategoryCollapsed={toggleCategoryCollapsed}
            triggerTool={triggerTool}
            unpinToolFromNav={unpinToolFromNav}
        />
    );
}
