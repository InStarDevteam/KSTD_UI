using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

[ApiController]
[Authorize]
[Route("api")]
public sealed class RequestsController(AppDb db) : ControllerBase
{
    private IQueryable<WorkRequest> VisibleRequests() => User.IsInRole("admin") ? db.Requests : db.Requests.Where(request => request.OwnerId == ApiErrors.UserId(User));

    private IQueryable<WorkRequest> Details() => VisibleRequests().Include(request => request.Owner).Include(request => request.Attachments).Include(request => request.Histories).ThenInclude(history => history.Actor).AsSplitQuery();

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken cancellationToken)
    {
        var counts = await VisibleRequests().GroupBy(request => request.Status).Select(group => new { status = group.Key, count = group.Count() }).ToListAsync(cancellationToken);
        return Ok(new { total = counts.Sum(item => item.count), byStatus = BusinessRules.Statuses.Select(status => new { status, count = counts.FirstOrDefault(item => item.status == status)?.count ?? 0 }) });
    }

    [HttpGet("requests")]
    public async Task<IActionResult> List(string? q, string? status, string sort = "created_desc", int page = 1, int pageSize = 10, CancellationToken cancellationToken = default)
    {
        if (page is < 1 or > 100000 || pageSize is < 1 or > 100 || q?.Length > 100 || (status is not null && !BusinessRules.Statuses.Contains(status)) || sort is not ("created_desc" or "created_asc" or "title_asc"))
        {
            return BadRequest(ApiErrors.Problem(HttpContext, 400, "invalid_filter", "검색 조건과 페이지 범위를 확인하세요."));
        }
        var query = Details().AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var search = q.Trim();
            query = query.Where(request => request.Title.Contains(search) || request.Description.Contains(search));
        }
        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(request => request.Status == status);
        }
        var total = await query.CountAsync(cancellationToken);
        query = sort switch
        {
            "created_asc" => query.OrderBy(request => request.CreatedAt).ThenBy(request => request.Id),
            "title_asc" => query.OrderBy(request => request.Title).ThenBy(request => request.Id),
            _ => query.OrderByDescending(request => request.CreatedAt).ThenByDescending(request => request.Id)
        };
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(new { items = items.Select(View), total, page, pageSize });
    }

    [HttpGet("requests/{id:int}")]
    public async Task<IActionResult> Detail(int id, CancellationToken cancellationToken)
    {
        var request = await Details().AsNoTracking().SingleOrDefaultAsync(request => request.Id == id, cancellationToken);
        return request is null ? Missing() : Ok(View(request));
    }

    [HttpPost("requests")]
    public async Task<IActionResult> Create(RequestDto input, CancellationToken cancellationToken)
    {
        var errors = BusinessRules.Validate(input.Title, input.Category, input.Description);
        if (errors.Count > 0)
        {
            return ValidationFailure(errors);
        }
        var user = await db.Users.SingleAsync(user => user.Id == ApiErrors.UserId(User), cancellationToken);
        var submissionKey = Request.Headers["Idempotency-Key"].FirstOrDefault();
        if (submissionKey is not null && !Guid.TryParse(submissionKey, out _))
        {
            return BadRequest(ApiErrors.Problem(HttpContext, 400, "invalid_submission_key", "중복제출 확인값을 다시 생성하세요."));
        }
        if (submissionKey is not null)
        {
            var existing = await Details().AsNoTracking().SingleOrDefaultAsync(request => request.OwnerId == user.Id && request.SubmissionKey == submissionKey, cancellationToken);
            if (existing is not null)
            {
                return Ok(View(existing));
            }
        }
        var request = new WorkRequest { Title = input.Title!.Trim(), Category = input.Category!, Description = input.Description!.Trim(), OwnerId = user.Id, Owner = user, SubmissionKey = submissionKey };
        request.Histories.Add(new RequestHistory { ActorId = user.Id, Actor = user, Action = "created", ToStatus = "submitted", Reason = "요청 등록" });
        await PersistCreated(request, cancellationToken);
        return Created($"/api/requests/{request.Id}", View(request));
    }

    private async Task PersistCreated(WorkRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        db.Requests.Add(request);
        await db.SaveChangesAsync(cancellationToken);
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "request_create", $"request:{request.Id}", true));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    [HttpPut("requests/{id:int}")]
    public async Task<IActionResult> Update(int id, UpdateRequestDto input, CancellationToken cancellationToken)
    {
        var request = await Details().SingleOrDefaultAsync(request => request.Id == id, cancellationToken);
        if (request is null)
        {
            return Missing();
        }
        if (request.OwnerId != ApiErrors.UserId(User) || request.Status != "submitted")
        {
            return StatusCode(403, ApiErrors.Problem(HttpContext, 403, "edit_forbidden", "작성자의 접수 상태 요청만 수정할 수 있습니다."));
        }
        var errors = BusinessRules.Validate(input.Title, input.Category, input.Description);
        if (errors.Count > 0)
        {
            return ValidationFailure(errors);
        }
        if (request.Version != input.Version)
        {
            return Conflict(ApiErrors.Problem(HttpContext, 409, "version_conflict", "요청이 변경되었습니다. 새로 조회하세요."));
        }
        request.Title = input.Title!.Trim();
        request.Category = input.Category!;
        request.Description = input.Description!.Trim();
        request.UpdatedAt = DateTime.UtcNow;
        request.Version++;
        await AddHistory(request, "updated", request.Status, "요청 내용 수정", cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(View(request));
    }

    [Authorize(Roles = "admin")]
    [HttpPost("requests/{id:int}/status")]
    public async Task<IActionResult> ChangeStatus(int id, StatusDto input, CancellationToken cancellationToken)
    {
        var request = await Details().SingleOrDefaultAsync(request => request.Id == id, cancellationToken);
        if (request is null)
        {
            return Missing();
        }
        if (!BusinessRules.CanTransition(request.Status, input.Status) || string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Trim().Length is < 3 or > 500)
        {
            return BadRequest(ApiErrors.Problem(HttpContext, 400, "invalid_transition", "허용된 다음 상태와 3~500자 처리 사유를 입력하세요."));
        }
        if (request.Version != input.Version)
        {
            return Conflict(ApiErrors.Problem(HttpContext, 409, "version_conflict", "요청이 변경되었습니다. 새로 조회하세요."));
        }
        var previous = request.Status;
        request.Status = input.Status!;
        request.UpdatedAt = DateTime.UtcNow;
        request.Version++;
        await AddHistory(request, "status_changed", previous, input.Reason.Trim(), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return Ok(View(request));
    }

    private async Task AddHistory(WorkRequest request, string action, string previous, string reason, CancellationToken cancellationToken)
    {
        var actorId = ApiErrors.UserId(User);
        request.Histories.Add(new RequestHistory { ActorId = actorId, Actor = await db.Users.SingleAsync(user => user.Id == actorId, cancellationToken), Action = action, FromStatus = previous, ToStatus = request.Status, Reason = reason });
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, action, $"request:{request.Id}", true));
    }

    private IActionResult Missing() => NotFound(ApiErrors.Problem(HttpContext, 404, "not_found", "요청을 찾을 수 없습니다."));

    private IActionResult ValidationFailure(Dictionary<string, string[]> errors)
    {
        var problem = ApiErrors.Problem(HttpContext, 400, "validation_failed", "입력 내용을 확인하세요.");
        problem.Extensions["errors"] = errors;
        return BadRequest(problem);
    }

    public static object View(WorkRequest request) => new
    {
        request.Id,
        request.Title,
        request.Category,
        request.Description,
        request.Status,
        request.OwnerId,
        ownerName = request.Owner.DisplayName,
        createdAt = DateTime.SpecifyKind(request.CreatedAt, DateTimeKind.Utc),
        updatedAt = DateTime.SpecifyKind(request.UpdatedAt, DateTimeKind.Utc),
        request.Version,
        attachments = request.Attachments.OrderBy(file => file.Id).Select(file => new { file.Id, file.FileName, file.Size, file.ContentType }),
        histories = request.Histories.OrderBy(history => history.Id).Select(history => new { history.Id, history.Action, history.FromStatus, history.ToStatus, history.Reason, actorName = history.Actor.DisplayName, createdAt = DateTime.SpecifyKind(history.CreatedAt, DateTimeKind.Utc) })
    };
}
