import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export function useNotificationTypeLabel() {
    const { t } = useTranslation();

    return useCallback(
        (type: unknown) => {
            const fallback = String(type || 'unknown');
            const key = `view.notification.filters.${fallback}`;
            const label = String(t(key));
            return label && label !== key ? label : fallback;
        },
        [t]
    );
}
