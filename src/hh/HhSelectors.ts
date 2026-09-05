export const HhSelectors = {
  authenticated: [
    '[data-qa="mainmenu_profileAndResumes"]',
    '[data-qa="mainmenu_vacancyResponses"]',
    '[data-qa="mainmenu_applicantProfileDesktopDrop"]',
    '[data-qa="mainmenu_applicantProfilePage"]',
    '[data-qa="mainmenu_applicantProfile"]',
    '[data-qa="mainmenu_myResumes"]',
    '[data-qa="mainmenu_responses"]',
  ],
  authRequired: ['[data-qa="mainmenu_login"]', '[data-qa="login"]'],
  captcha: [
    '[data-qa*="captcha"]',
    'iframe[src*="captcha"]',
    'iframe[title*="captcha" i]',
    'input[name*="captcha" i]',
  ],
  vacancyTitle: ['[data-qa="vacancy-title"]', "h1"],
  vacancyEmployer: [
    '[data-qa="vacancy-company-name"]',
    '[data-qa="vacancy-company"]',
  ],
  vacancyClosed: [
    '[data-qa="vacancy-closed"]',
    '[data-qa="vacancy-archived"]',
    '[data-qa="vacancy-error"]',
  ],
  alreadyApplied: [
    '[data-qa="vacancy-response-link-view-topic"]',
    '[data-qa="vacancy-response-status"]',
    '[data-qa="vacancy-response-success"]',
  ],
  applyEntry: [
    '[data-qa="vacancy-response-link-top"]',
    '[data-qa="vacancy-response-link-bottom"]',
    '[data-qa="vacancy-response-link"]',
  ],
  applicationRoot: [
    '[data-qa="vacancy-response-popup"]',
    '[data-qa="vacancy-response-form"]',
    '[role="dialog"]',
  ],
  questionnaire: [
    '[data-qa="vacancy-response-popup-form-questionnaire"]',
    '[data-qa="vacancy-response-popup-form-question"]',
    '[data-qa*="employer-question"]',
    'textarea[name^="question_"]',
    'input[name^="question_"]',
  ],
  coverLetter: [
    '[data-qa="vacancy-response-popup-form-letter-input"]',
    '[data-qa="vacancy-response-letter-input"]',
    'textarea[name="letter"]',
  ],
  submitApplication: [
    '[data-qa="vacancy-response-submit-popup"]',
    '[data-qa="vacancy-response-letter-submit"]',
    '[data-qa="vacancy-response-submit"]',
  ],
  submissionSuccess: [
    '[data-qa="vacancy-response-link-view-topic"]',
    '[data-qa="vacancy-response-success"]',
    '[data-qa="vacancy-response-status"]',
  ],
} as const;

export const HhTextPatterns = {
  authRequired: /(?:^|\s)(?:войти|вход)(?:\s|$)/i,
  captcha: /captcha|капч|подтвердите.{0,30}(?:не робот|человек)|проверка безопасности/i,
  vacancyClosed: /ваканси[яи].{0,40}(?:закрыта|в архиве|не найдена|недоступна)/i,
  alreadyApplied: /вы (?:уже )?откликнул(?:ись|ась)|отклик отправлен|посмотреть отклик/i,
  apply: /^откликнуться$/i,
  questionnaire: /вопросы работодателя|ответьте на вопросы|дополнительные вопросы/i,
  coverLetter: /сопроводительное письмо/i,
  submit: /^(?:отправить|откликнуться)$/i,
  success: /отклик отправлен|вы откликнулись|отклик доставлен/i,
} as const;

export const HhTextSnippets = {
  submissionSuccess: ["отклик отправлен", "вы откликнулись", "отклик доставлен"],
} as const;

export const knownSubmissionUrlPattern =
  /(?:vacancy[_/-]?response|negotiations\/vacancy|applicant\/vacancy_response).*(?:submit|create|send)|(?:submit|create|send).*(?:vacancy[_/-]?response)/i;
