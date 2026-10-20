using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

[ApiController]
[Authorize]
[Route("api")]
public sealed class AttachmentsController(AppDb db, StorageOptions storage, ILogger<AttachmentsController> logger) : ControllerBase
{
    private IQueryable<WorkRequest> VisibleRequests() => User.IsInRole("admin") ? db.Requests : db.Requests.Where(request => request.OwnerId == ApiErrors.UserId(User));

    [HttpPost("requests/{id:int}/attachments")]
    [RequestSizeLimit(16 * 1024 * 1024)]
    public async Task<IActionResult> Upload(int id, List<IFormFile> files, CancellationToken cancellationToken)
    {
        var request = await VisibleRequests().Include(request => request.Attachments).SingleOrDefaultAsync(request => request.Id == id, cancellationToken);
        if (request is null)
        {
            return Missing();
        }
        if (!CanEdit(request))
        {
            return StatusCode(403, ApiErrors.Problem(HttpContext, 403, "edit_forbidden", "작성자의 접수 상태 요청만 첨부를 변경할 수 있습니다."));
        }
        if (files.Count == 0 || request.Attachments.Count + files.Count > 3)
        {
            return BadRequest(ApiErrors.Problem(HttpContext, 400, "file_count", "첨부파일은 요청당 1~3개를 선택하세요."));
        }
        var pending = new List<(Attachment File, byte[] Bytes)>();
        foreach (var file in files)
        {
            if (file.Length is < 1 or > BusinessRules.MaxFileSize)
            {
                return StatusCode(413, ApiErrors.Problem(HttpContext, 413, "file_size", "파일 크기는 1바이트~5MB여야 합니다."));
            }
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, cancellationToken);
            var bytes = buffer.ToArray();
            var safeName = BusinessRules.SafeFileName(file.FileName);
            var type = BusinessRules.DetectContent(Path.GetExtension(safeName).ToLowerInvariant(), bytes);
            if (type is null)
            {
                return BadRequest(ApiErrors.Problem(HttpContext, 400, "file_type", "TXT(UTF-8), PDF, PNG 파일만 올릴 수 있습니다. 파일의 실제 형식을 확인하세요."));
            }
            pending.Add((new Attachment { RequestId = request.Id, FileName = safeName, StorageName = Guid.NewGuid().ToString("N"), ContentType = type, Size = bytes.Length }, bytes));
        }
        return await SaveFiles(request, pending, cancellationToken);
    }

    private async Task<IActionResult> SaveFiles(WorkRequest request, List<(Attachment File, byte[] Bytes)> pending, CancellationToken cancellationToken)
    {
        var paths = new List<string>();
        try
        {
            foreach (var (file, bytes) in pending)
            {
                var path = Path.Combine(storage.Uploads, file.StorageName);
                await System.IO.File.WriteAllBytesAsync(path, bytes, cancellationToken);
                paths.Add(path);
                if (!OperatingSystem.IsWindows())
                {
                    System.IO.File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                }
                request.Attachments.Add(file);
            }
            request.Version++;
            request.UpdatedAt = DateTime.UtcNow;
            db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "attachment_upload", $"request:{request.Id}", true));
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            foreach (var path in paths)
            {
                System.IO.File.Delete(path);
            }
            throw;
        }
        var loaded = await db.Requests.Include(item => item.Owner).Include(item => item.Attachments).Include(item => item.Histories).ThenInclude(history => history.Actor).AsSplitQuery().SingleAsync(item => item.Id == request.Id, cancellationToken);
        return Ok(RequestsController.View(loaded));
    }

    [HttpGet("attachments/{id:int}/download")]
    public async Task<IActionResult> Download(int id, CancellationToken cancellationToken)
    {
        var file = await db.Attachments.Include(file => file.Request).SingleOrDefaultAsync(file => file.Id == id, cancellationToken);
        if (file is null || (!User.IsInRole("admin") && file.Request.OwnerId != ApiErrors.UserId(User)))
        {
            return Missing();
        }
        var path = Path.Combine(storage.Uploads, file.StorageName);
        if (!System.IO.File.Exists(path))
        {
            return Missing();
        }
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "attachment_download", $"attachment:{file.Id}", true));
        await db.SaveChangesAsync(cancellationToken);
        return PhysicalFile(path, file.ContentType, file.FileName, enableRangeProcessing: false);
    }

    [HttpDelete("attachments/{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var file = await db.Attachments.Include(file => file.Request).SingleOrDefaultAsync(file => file.Id == id && file.Request.OwnerId == ApiErrors.UserId(User), cancellationToken);
        if (file is null)
        {
            return Missing();
        }
        if (!CanEdit(file.Request))
        {
            return StatusCode(403, ApiErrors.Problem(HttpContext, 403, "edit_forbidden", "접수 상태에서만 첨부를 삭제할 수 있습니다."));
        }
        db.Attachments.Remove(file);
        file.Request.Version++;
        file.Request.UpdatedAt = DateTime.UtcNow;
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "attachment_delete", $"attachment:{id}", true));
        await db.SaveChangesAsync(cancellationToken);
        try
        {
            System.IO.File.Delete(Path.Combine(storage.Uploads, file.StorageName));
        }
        catch (IOException exception)
        {
            // Logical deletion remains committed; operators can remove the unreachable orphan.
            logger.LogWarning(exception, "Orphan attachment cleanup required: {StorageName}", file.StorageName);
        }
        return NoContent();
    }

    private bool CanEdit(WorkRequest request) => request.OwnerId == ApiErrors.UserId(User) && request.Status == "submitted";
    private IActionResult Missing() => NotFound(ApiErrors.Problem(HttpContext, 404, "not_found", "첨부파일을 찾을 수 없습니다."));
}
