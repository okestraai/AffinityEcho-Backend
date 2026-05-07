import { UserResourcesService } from '../../modules/user/services/user-resources.service';

describe('UserResourcesService', () => {
  let service: UserResourcesService;

  beforeEach(() => {
    service = new UserResourcesService();
  });

  describe('getCrisisResources', () => {
    it('should return success with data', () => {
      const result = service.getCrisisResources();
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should include emergency contact', () => {
      const result = service.getCrisisResources();
      expect(result.data.emergency).toBeDefined();
      expect(result.data.emergency.number).toBe('911');
      expect(result.data.emergency.available).toBe('24/7');
    });

    it('should include categories', () => {
      const result = service.getCrisisResources();
      expect(result.data.categories).toBeDefined();
      expect(Array.isArray(result.data.categories)).toBe(true);
      expect(result.data.categories.length).toBeGreaterThan(0);
    });

    it('should include mental health category', () => {
      const result = service.getCrisisResources();
      const mentalHealth = result.data.categories.find((c: any) => c.id === 'mental-health');
      expect(mentalHealth).toBeDefined();
      expect(mentalHealth.resources.length).toBeGreaterThan(0);
    });

    it('should include workplace category', () => {
      const result = service.getCrisisResources();
      const workplace = result.data.categories.find((c: any) => c.id === 'workplace');
      expect(workplace).toBeDefined();
    });

    it('should include 988 lifeline', () => {
      const result = service.getCrisisResources();
      const mentalHealth = result.data.categories.find((c: any) => c.id === 'mental-health');
      const lifeline = mentalHealth.resources.find((r: any) => r.phone === '988');
      expect(lifeline).toBeDefined();
      expect(lifeline.available).toBe('24/7');
    });

    it('should have valid resource structure', () => {
      const result = service.getCrisisResources();
      const firstCategory = result.data.categories[0];
      const firstResource = firstCategory.resources[0];
      expect(firstResource.name).toBeDefined();
      expect(firstResource.description).toBeDefined();
    });

    it('should include self-care category', () => {
      const result = service.getCrisisResources();
      const selfCare = result.data.categories.find((c: any) => c.id === 'self-care');
      expect(selfCare).toBeDefined();
    });
  });
});
