using System.Threading.RateLimiting;
using Kstd.Api;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")))
{
    builder.WebHost.UseUrls("http://localhost:8001");
}
var storage = new StorageOptions(Path.GetFullPath(Environment.GetEnvironmentVariable("KSTD_DATA_DIR") ?? Path.Combine(builder.Environment.ContentRootPath, "data")));
storage.PrepareDirectories();
builder.Services.AddSingleton(storage);
builder.Services.AddDbContext<AppDb>(options => options.UseSqlite($"Data Source={storage.Database};Foreign Keys=True;Default Timeout=10"));
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(storage.Keys)).SetApplicationName("Kstd.Sample");
builder.Services.AddScoped<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "Kstd.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromMinutes(SampleSessionOptions.Minutes(builder.Environment));
    options.SlidingExpiration = false;
    options.Events.OnValidatePrincipal = SessionCookieValidation.ValidatePrincipal;
    options.Events.OnRedirectToLogin = context => ApiErrors.Write(context.HttpContext, 401, "authentication_required", "로그인이 필요합니다.");
    options.Events.OnRedirectToAccessDenied = context => ApiErrors.Write(context.HttpContext, 403, "forbidden", "작업 권한이 없습니다.");
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "Kstd.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 16 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024 * 1024);
builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
{
    options.InvalidModelStateResponseFactory = context => new BadRequestObjectResult(ApiErrors.Problem(context.HttpContext, 400, "invalid_json", "요청 형식을 확인하세요."));
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.OnRejected = (context, _) => new ValueTask(ApiErrors.Write(context.HttpContext, 429, "rate_limited", "요청이 많습니다. 잠시 후 다시 시도하세요."));
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    context.Response.Headers["Content-Security-Policy"] = context.Request.Path.StartsWithSegments("/api")
        ? "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    context.Response.Headers.CacheControl = "no-store";
    try
    {
        await next(context);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
        context.Response.StatusCode = 499;
    }
    catch (DbUpdateConcurrencyException)
    {
        await ApiErrors.Write(context, 409, "version_conflict", "다른 작업에서 변경되었습니다. 새로 조회한 후 다시 시도하세요.");
    }
    catch (DbUpdateException exception) when (exception.InnerException is Microsoft.Data.Sqlite.SqliteException { SqliteErrorCode: 19 })
    {
        await ApiErrors.Write(context, 409, "data_conflict", "중복되거나 충돌한 요청입니다. 기존 결과를 확인한 후 다시 시도하세요.");
    }
    catch (BadHttpRequestException)
    {
        await ApiErrors.Write(context, 400, "invalid_request", "요청 형식 또는 크기를 확인하세요.");
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Request failed. TraceId={TraceId}", context.TraceIdentifier);
        await ApiErrors.Write(context, 500, "server_error", "처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
    }
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method) || HttpMethods.IsOptions(context.Request.Method))
    {
        await next(context);
        return;
    }
    // Explicit validation covers JSON and multipart alike; no browser-only protection assumption.
    try
    {
        await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
    }
    catch (AntiforgeryValidationException)
    {
        await ApiErrors.Write(context, 400, "csrf_invalid", "보안 확인이 만료되었습니다. 화면을 새로 고친 후 다시 시도하세요.");
        return;
    }
    await next(context);
});
app.MapControllers();
app.Map("/api/{**path}", (HttpContext context) => ApiErrors.Write(context, 404, "not_found", "API 경로를 찾을 수 없습니다."));
app.MapFallbackToFile("index.html");
app.MapGet("/api/health", async (AppDb db, CancellationToken cancellationToken) => Results.Ok(new { status = await db.Database.CanConnectAsync(cancellationToken) ? "ok" : "unavailable", database = "sqlite", utc = DateTime.UtcNow }));
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Database.MigrateAsync();
    await SeedData.Initialize(db, scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>(), app.Environment);
    storage.RestrictPersistedFiles();
}
await app.RunAsync();

public partial class Program;
