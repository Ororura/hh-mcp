import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export type FixtureSessionMode = "authenticated" | "auth-required";

export class HhFixtureServer {
  #server = createServer((request, response) => this.handle(request, response));
  #submitCount = 0;
  #submittedCoverLetter = "";
  #submittedResumeId = "";
  sessionMode: FixtureSessionMode = "authenticated";
  baseUrl = "";

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.once("error", reject);
      this.#server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.#server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  get host(): string {
    return new URL(this.baseUrl).host;
  }

  get submitCount(): number {
    return this.#submitCount;
  }

  get submittedCoverLetter(): string {
    return this.#submittedCoverLetter;
  }

  get submittedResumeId(): string {
    return this.#submittedResumeId;
  }

  resetSubmissions(): void {
    this.#submitCount = 0;
    this.#submittedCoverLetter = "";
    this.#submittedResumeId = "";
  }

  vacancyUrl(id: number): string {
    return `${this.baseUrl}/vacancy/${id}`;
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", this.baseUrl || "http://127.0.0.1");
    if (url.pathname === "/vacancy-response-submit" && request.method === "POST") {
      this.#submitCount += 1;
      const coverLetterHeader = request.headers["x-cover-letter"];
      this.#submittedCoverLetter = Array.isArray(coverLetterHeader)
        ? (coverLetterHeader[0] ?? "")
        : (coverLetterHeader ?? "");
      const resumeHeader = request.headers["x-resume-id"];
      this.#submittedResumeId = Array.isArray(resumeHeader)
        ? (resumeHeader[0] ?? "")
        : (resumeHeader ?? "");
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }

    if (url.pathname === "/applicant/resumes") {
      const resumes =
        this.sessionMode === "authenticated"
          ? '<a data-qa="resume-title-link" href="/resume/resume-frontend">Frontend Developer</a>' +
            '<a data-qa="resume-title-link" href="/resume/resume-java">Постоянная работа' +
            '<span data-qa="resume-title">Java Backend Developer</span>120 000 ₽ · Удалённо</a>'
          : "";
      this.html(response, this.page("Session", resumes, this.sessionMode));
      return;
    }

    if (url.pathname === "/resume/resume-java") {
      this.html(
        response,
        this.page(
          "Java Backend Developer",
          '<section data-qa="resume-block-title-position">Junior Java Backend Developer</section>' +
            '<h2>Опыт работы</h2><section>Commercial backend development: implemented REST APIs with Java 21 and Spring Boot; optimized PostgreSQL queries; integrated services through Kafka.</section>' +
            '<h2>Навыки</h2><section>Java 21, Spring Boot, PostgreSQL, Kafka, JUnit 5, Mockito, Docker</section>' +
            '<h2>Образование</h2><section>Applied Computer Science</section>' +
            '<h2>О себе</h2><section>Worked in Scrum, used GitLab and participated in code review.</section>',
        ),
      );
      return;
    }

    if (url.pathname === "/resume/resume-frontend") {
      this.html(
        response,
        this.page(
          "Frontend Developer",
          '<section data-qa="resume-block-experience">Built React user interfaces.</section>' +
            '<section data-qa="resume-block-skills">React, TypeScript</section>',
        ),
      );
      return;
    }

    const match = /^\/vacancy\/(\d+)$/.exec(url.pathname);
    if (!match?.[1]) {
      response.writeHead(404).end();
      return;
    }
    this.html(response, this.vacancy(Number(match[1])));
  }

  private vacancy(id: number): string {
    switch (id) {
      case 101:
        return this.page("Closed", '<div data-qa="vacancy-closed">Вакансия закрыта</div>');
      case 102:
        return this.page(
          "Applied",
          '<div data-qa="vacancy-response-link-view-topic">Вы уже откликнулись</div>',
        );
      case 103:
        return this.page("Questionnaire", this.applyButton("showQuestionnaire()"), "authenticated", scripts);
      case 104:
        return this.page(
          "Captcha",
          '<div data-qa="captcha">Подтвердите, что вы не робот</div>',
          "authenticated",
        );
      case 105:
        return this.page(
          "External",
          '<a data-qa="vacancy-response-link-top" href="https://employer.example/apply">Откликнуться</a>',
        );
      case 107:
        return this.page("Unknown", this.applyButton("void 0"));
      case 108:
        return this.page("No letter", this.applyButton("showForm(false, false)"), "authenticated", scripts);
      case 109:
        return this.page("Required letter", this.applyButton("showForm(true, true)"), "authenticated", scripts);
      case 110:
        return this.page("Login", this.applyButton("showForm(true, false)"), "auth-required", scripts);
      case 112:
        return this.page("Unsupported", "<p>Unknown vacancy controls</p>");
      case 113:
        return this.page("Direct submit", this.applyButton("submitApplication()"), "authenticated", scripts);
      case 114:
        return this.page(
          "Unconfirmed submit",
          this.applyButton("showUnconfirmedForm()"),
          "authenticated",
          scripts,
        );
      case 116:
        return this.page(
          "Hidden letter",
          this.applyButton("showHiddenLetterForm()"),
          "authenticated",
          scripts,
        );
      case 117:
      case 118:
        return this.page(
          "Resume selection",
          this.applyButton("showResumeForm()"),
          "authenticated",
          scripts,
        );
      case 119:
        return this.page(
          "Country warning",
          this.applyButton("showCountryWarning()"),
          "authenticated",
          scripts,
        );
      case 120:
        return this.page(
          "Text letter toggle",
          this.applyButton("showTextLetterForm()"),
          "authenticated",
          scripts,
        );
      default:
        return this.page("Backend Developer", this.applyButton("showForm(true, false)"), "authenticated", scripts);
    }
  }

  private applyButton(action: string): string {
    return `<button data-qa="vacancy-response-link-top" onclick="${action}">Откликнуться</button>`;
  }

  private page(
    title: string,
    content: string,
    session: FixtureSessionMode = "authenticated",
    script = "",
  ): string {
    const menu =
      session === "authenticated"
        ? '<div data-qa="mainmenu_profileAndResumes">Profile and resumes</div>'
        : '<a data-qa="mainmenu_login">Войти</a>';
    return `<!doctype html>
      <html lang="ru"><head><meta charset="utf-8"><title>${title}</title></head>
      <body>${menu}<h1 data-qa="vacancy-title">${title}</h1>
      <div data-qa="vacancy-company-name">Example</div>
      <div data-qa="vacancy-description">Develop Java and Spring Boot services, REST APIs, PostgreSQL integrations and automated tests.</div>
      <div data-qa="vacancy-key-skills"><span data-qa="bloko-tag__text">Java</span><span data-qa="bloko-tag__text">Spring Boot</span><span data-qa="bloko-tag__text">PostgreSQL</span></div>
      ${content}<script>${script}</script></body></html>`;
  }

  private html(response: ServerResponse, body: string): void {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  }
}

const scripts = `
  function showCountryWarning() {
    document.body.insertAdjacentHTML('beforeend',
      '<div data-qa="country-warning">' +
      '<p>Вы откликаетесь на вакансию в другой стране</p>' +
      '<button data-qa="vacancy-response-country-warning-confirm" onclick="continueAfterCountryWarning()">Все равно откликнуться</button>' +
      '<button>Отменить</button></div>');
  }
  function continueAfterCountryWarning() {
    document.querySelector('[data-qa="country-warning"]')?.remove();
    showResumeForm();
  }
  function showQuestionnaire() {
    document.body.insertAdjacentHTML('beforeend',
      '<h2>Ответьте на вопросы</h2>' +
      '<div data-qa="task-question"><label>Почему вы хотите у нас работать?</label>' +
      '<textarea name="task_123_text"></textarea></div>' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Откликнуться</button>');
  }
  function showForm(withLetter, required) {
    const letter = withLetter
      ? '<textarea data-qa="vacancy-response-popup-form-letter-input" ' + (required ? 'required aria-required="true"' : '') + '></textarea>'
      : '';
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' + letter +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Отправить</button></div>');
  }
  async function submitApplication() {
    const coverLetter = document.querySelector('[data-qa="vacancy-response-popup-form-letter-input"]')?.value || '';
    const response = await fetch('/vacancy-response-submit', {
      method: 'POST',
      headers: {
        'x-cover-letter': coverLetter,
        'x-resume-id': document.querySelector('[data-selected-resume-id]')?.getAttribute('data-selected-resume-id') || '',
      },
    });
    if (response.ok) {
      document.querySelector('[data-qa="vacancy-response-popup"]')?.remove();
      document.body.insertAdjacentHTML('beforeend', '<div data-qa="vacancy-response-success">Отклик отправлен</div>');
    }
  }
  function showUnconfirmedForm() {
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitWithoutConfirmation()">Отправить</button></div>');
  }
  async function submitWithoutConfirmation() {
    await fetch('/vacancy-response-submit', { method: 'POST' });
  }
  function showHiddenLetterForm() {
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' +
      '<div role="button" tabindex="0" data-qa="vacancy-response-letter-toggle">' +
      '<span>Сопроводительное письмо</span><span onclick="showHiddenLetter(event)">Добавить</span></div>' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Отправить</button></div>');
  }
  function showTextLetterForm() {
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' +
      '<button onclick="showTextLetter(event)">Добавить сопроводительное</button>' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Отправить</button></div>');
  }
  function showTextLetter(event) {
    event.stopPropagation();
    event.currentTarget.insertAdjacentHTML(
      'beforebegin',
      '<textarea data-qa="vacancy-response-popup-form-letter-input"></textarea>',
    );
    event.currentTarget.remove();
  }
  function showHiddenLetter(event) {
    event.stopPropagation();
    document.querySelector('[data-qa="vacancy-response-letter-toggle"]')?.insertAdjacentHTML(
      'beforebegin',
      '<textarea data-qa="vacancy-response-popup-form-letter-input"></textarea>',
    );
    document.querySelector('[data-qa="vacancy-response-letter-toggle"]')?.remove();
  }
  function showResumeForm() {
    document.body.insertAdjacentHTML('beforeend',
      '<div role="dialog" data-qa="vacancy-response-popup">' +
      '<div id="resume-picker" role="button" tabindex="0" data-selected-resume-id="resume-frontend" onclick="toggleResumeOptions()">' +
      '<div data-qa="resume-title">Frontend Developer</div></div>' +
      '<div data-qa="magritte-select-option-list" role="listbox" style="display:none">' +
      '<label role="option" aria-selected="true" data-magritte-select-option="resume-frontend" onclick="selectResume(event, this)">' +
      '<div data-qa="resume-title">Frontend Developer</div></label>' +
      '<label role="option" aria-selected="false" data-magritte-select-option="resume-java" onclick="selectResume(event, this)">' +
      '<div data-qa="resume-title">Java Backend Developer</div></label></div>' +
      '<textarea data-qa="vacancy-response-popup-form-letter-input"></textarea>' +
      '<button data-qa="vacancy-response-submit-popup" onclick="submitApplication()">Отправить</button></div>');
  }
  function toggleResumeOptions() {
    const list = document.querySelector('[data-qa="magritte-select-option-list"]');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
  }
  function selectResume(event, option) {
    event.stopPropagation();
    const picker = document.querySelector('#resume-picker');
    const selectedId = option.getAttribute('data-magritte-select-option');
    const selectedTitle = option.querySelector('[data-qa="resume-title"]').textContent;
    picker.setAttribute('data-selected-resume-id', selectedId);
    picker.querySelector('[data-qa="resume-title"]').textContent = selectedTitle;
    document.querySelectorAll('[role="option"]').forEach(item =>
      item.setAttribute('aria-selected', String(item === option)));
    document.querySelector('[data-qa="magritte-select-option-list"]').style.display = 'none';
  }
`;
