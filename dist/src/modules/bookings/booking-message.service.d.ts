export type BookingPlatform = 'whatsapp' | 'instagram' | 'messenger';
export type BookingStep = 'collect_service' | 'collect_date' | 'collect_time' | 'collect_name' | 'review' | 'confirm_deposit' | 'confirmed' | 'cancelled';
export declare class BookingMessageService {
    getMessage(step: BookingStep, data: any, platform: BookingPlatform): string;
    private format;
}
