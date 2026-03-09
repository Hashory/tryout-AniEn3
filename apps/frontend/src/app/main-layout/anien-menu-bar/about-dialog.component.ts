import { Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-about-dialog',
  standalone: true,
  template: `
    <div class="about-dialog">
      <h2 class="title">About AniEn</h2>
      <p class="description">AniEn is a modern web-based animation engine/timeline editor.</p>

      <div class="info-section">
        <span class="label">GitHub Repository:</span>
        <a href="https://github.com/Hashory/tryout-AniEn3.git" target="_blank" class="link">
          Hashory/tryout-AniEn3
        </a>
      </div>

      <div class="actions">
        <button class="close-btn" (click)="dialogRef.close()">Close</button>
      </div>
    </div>
  `,
  styles: [
    `
      .about-dialog {
        background: rgba(30, 30, 30, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.5rem;
        color: #fff;
        font-family: sans-serif;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        max-width: 400px;
      }

      .title {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #fff;
      }

      .description {
        font-size: 0.875rem;
        color: #ccc;
        line-height: 1.5;
        margin-bottom: 1.5rem;
      }

      .info-section {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-bottom: 2rem;
      }

      .label {
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .link {
        color: #4da6ff;
        text-decoration: none;
        font-size: 0.9375rem;
        transition: color 0.2s;
      }

      .link:hover {
        color: #80c1ff;
        text-decoration: underline;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
      }

      .close-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .close-btn:active {
        transform: scale(0.98);
      }
    `,
  ],
})
export class AboutDialogComponent {
  public dialogRef = inject(DialogRef<string>);
}
