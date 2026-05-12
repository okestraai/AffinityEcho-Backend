import { EditorialService, TogetherApiError } from '../../modules/content-safety/editorial/editorial.service';
import { createMockConfigService } from '../helpers/mock-supabase';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('EditorialService', () => {
  let service: EditorialService;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockConfigService({
      TOGETHER_API_KEY: 'tgp_test_key',
      TOGETHER_BASE_URL: 'https://api.together.xyz/v1',
      TOGETHER_MODEL: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
      TOGETHER_TIMEOUT_MS: '5000',
    });
    service = new EditorialService(config as any);
  });

  describe('judge', () => {
    const payload = {
      subject: {
        type: 'feed_post' as const,
        id: 'post-1',
        authorId: 'user-1',
        authorIsAnonymous: false,
        content: 'Test content',
        createdAt: '2026-01-01T00:00:00Z',
      },
      parentChain: [],
      authorSignals: {
        accountAgeDays: 30,
        priorFlagsAgainstAuthor: 0,
        priorRemovalsAgainstAuthor: 0,
        postsLast24h: 1,
      },
      policyVersion: '2026-05-12.v1',
    };

    it('should return a valid verdict on successful API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: 'allow',
                    confidence: 0.95,
                    severity: 'none',
                    categories: ['safe'],
                    rationale: 'No issues found.',
                    userFacingReason: null,
                  }),
                },
              },
            ],
          }),
      });

      const result = await service.judge(payload);

      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('allow');
      expect(result!.confidence).toBe(0.95);
      expect(result!.severity).toBe('none');
      expect(result!.categories).toEqual(['safe']);
      expect(result!.rationale).toBe('No issues found.');
      expect(result!.userFacingReason).toBeNull();
    });

    it('should call Together.ai with correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '{"verdict":"allow","confidence":0.9,"severity":"none","categories":[],"rationale":"ok","userFacingReason":null}' } }],
          }),
      });

      await service.judge(payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.together.xyz/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer tgp_test_key');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('meta-llama/Llama-3.1-8B-Instruct-Turbo');
      expect(body.temperature).toBe(0.1);
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
    });

    it('should throw TogetherApiError on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      });

      await expect(service.judge(payload)).rejects.toThrow(TogetherApiError);
    });

    it('should return null when API key is not configured', async () => {
      const config = createMockConfigService({
        TOGETHER_API_KEY: '',
      });
      const unconfigured = new EditorialService(config as any);

      const result = await unconfigured.judge(payload);
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle invalid verdict and default to escalate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: 'invalid_value',
                    confidence: 'not_a_number',
                    severity: 'unknown',
                    categories: 'not_array',
                    rationale: 123,
                  }),
                },
              },
            ],
          }),
      });

      const result = await service.judge(payload);
      expect(result!.verdict).toBe('escalate');
      expect(result!.confidence).toBe(0.5);
      expect(result!.severity).toBe('medium');
      expect(result!.categories).toEqual([]);
      expect(result!.rationale).toBe('');
    });

    it('should clamp confidence to 0-1 range', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: 'allow',
                    confidence: 1.5,
                    severity: 'none',
                    categories: [],
                    rationale: 'ok',
                    userFacingReason: null,
                  }),
                },
              },
            ],
          }),
      });

      const result = await service.judge(payload);
      expect(result!.confidence).toBe(1.0);
    });

    it('should throw on empty response content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: {} }] }),
      });

      await expect(service.judge(payload)).rejects.toThrow('No content in Together.ai response');
    });

    it('should throw on invalid JSON in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'not valid json' } }],
          }),
      });

      await expect(service.judge(payload)).rejects.toThrow();
    });

    it('should truncate long rationale to 300 chars', async () => {
      const longRationale = 'x'.repeat(500);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    verdict: 'allow',
                    confidence: 0.9,
                    severity: 'none',
                    categories: [],
                    rationale: longRationale,
                    userFacingReason: null,
                  }),
                },
              },
            ],
          }),
      });

      const result = await service.judge(payload);
      expect(result!.rationale.length).toBeLessThanOrEqual(300);
    });
  });
});
